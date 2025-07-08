import { IScanner } from '@/interfaces/scanner';
import { ApiSpec, Endpoint, HttpMethod, AuthType, AuthInfo } from '@/models/types';
import { Config } from '@/models/config';
import { createAuthStrategy } from '@/auth/factory';

/**
 * GraphQL introspection query to discover the complete schema
 */
const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        ...FullType
      }
      directives {
        name
        description
        locations
        args {
          ...InputValue
        }
      }
    }
  }

  fragment FullType on __Type {
    kind
    name
    description
    fields(includeDeprecated: true) {
      name
      description
      args {
        ...InputValue
      }
      type {
        ...TypeRef
      }
      isDeprecated
      deprecationReason
    }
    inputFields {
      ...InputValue
    }
    interfaces {
      ...TypeRef
    }
    enumValues(includeDeprecated: true) {
      name
      description
      isDeprecated
      deprecationReason
    }
    possibleTypes {
      ...TypeRef
    }
  }

  fragment InputValue on __InputValue {
    name
    description
    type { ...TypeRef }
    defaultValue
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * GraphQL type kinds from the introspection system
 */
enum GraphQLTypeKind {
  SCALAR = 'SCALAR',
  OBJECT = 'OBJECT',
  INTERFACE = 'INTERFACE',
  UNION = 'UNION',
  ENUM = 'ENUM',
  INPUT_OBJECT = 'INPUT_OBJECT',
  LIST = 'LIST',
  NON_NULL = 'NON_NULL',
}

/**
 * Interfaces for GraphQL introspection result structure
 */
interface GraphQLType {
  kind: GraphQLTypeKind;
  name: string | null;
  description?: string | null;
  fields?: GraphQLField[] | null;
  inputFields?: GraphQLInputValue[] | null;
  interfaces?: GraphQLType[] | null;
  enumValues?: GraphQLEnumValue[] | null;
  possibleTypes?: GraphQLType[] | null;
  ofType?: GraphQLType | null;
}

interface GraphQLField {
  name: string;
  description?: string | null;
  args: GraphQLInputValue[];
  type: GraphQLType;
  isDeprecated: boolean;
  deprecationReason?: string | null;
}

interface GraphQLInputValue {
  name: string;
  description?: string | null;
  type: GraphQLType;
  defaultValue?: string | null;
}

interface GraphQLEnumValue {
  name: string;
  description?: string | null;
  isDeprecated: boolean;
  deprecationReason?: string | null;
}

interface GraphQLSchema {
  queryType?: { name: string } | null;
  mutationType?: { name: string } | null;
  subscriptionType?: { name: string } | null;
  types: GraphQLType[];
  directives: Array<{
    name: string;
    description?: string | null;
    locations: string[];
    args: GraphQLInputValue[];
  }>;
}

interface IntrospectionResult {
  data?: {
    __schema: GraphQLSchema;
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
  }>;
}

/**
 * Error thrown when GraphQL introspection fails
 */
export class GraphQLIntrospectionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'GraphQLIntrospectionError';
  }
}

/**
 * Scanner implementation for GraphQL APIs using introspection
 */
export class GraphQLScanner implements IScanner {
  private readonly endpoint: string;
  private readonly authInfo?: AuthInfo;
  private readonly timeout: number;

  constructor(config: Config) {
    if (!config.url) {
      throw new Error('GraphQL endpoint URL is required');
    }

    this.endpoint = config.url;
    this.timeout = config.timeout || 30000;

    // Build auth info from config
    if (config.authType && config.authType !== AuthType.NONE) {
      this.authInfo = {
        type: config.authType,
        credentials: {
          token: config.token,
          headerName: config.authHeaderName,
        },
      };
    }
  }

  /**
   * Scans the GraphQL API using introspection to discover the schema
   */
  async scan(): Promise<ApiSpec> {
    try {
      const introspectionResult = await this.performIntrospection();
      return this.parseIntrospectionResult(introspectionResult);
    } catch (error) {
      if (error instanceof GraphQLIntrospectionError) {
        throw error;
      }
      throw new GraphQLIntrospectionError(
        `Failed to scan GraphQL API: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Performs the introspection query against the GraphQL endpoint
   */
  private async performIntrospection(): Promise<IntrospectionResult> {
    const requestBody = {
      query: INTROSPECTION_QUERY,
      variables: {},
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Apply authentication if configured
    if (this.authInfo) {
      try {
        const authStrategy = createAuthStrategy({
          type: this.authInfo.type,
          token: this.authInfo.credentials?.token,
          headerName: this.authInfo.credentials?.headerName,
        });

        const requestConfig = { headers };
        authStrategy.applyAuth(requestConfig);
        Object.assign(headers, requestConfig.headers);
      } catch (error) {
        throw new GraphQLIntrospectionError(
          `Authentication configuration error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new GraphQLIntrospectionError(
          `HTTP ${response.status}: ${response.statusText}. ` +
          `This might indicate that introspection is disabled on the GraphQL endpoint.`
        );
      }

      const result: IntrospectionResult = await response.json();

      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map(err => err.message).join(', ');
        throw new GraphQLIntrospectionError(
          `GraphQL introspection errors: ${errorMessages}. ` +
          `Introspection might be disabled on this endpoint.`
        );
      }

      if (!result.data?.__schema) {
        throw new GraphQLIntrospectionError(
          'Invalid introspection response: missing schema data. ' +
          'Introspection might be disabled on this endpoint.'
        );
      }

      return result;
    } catch (error) {
      if (error instanceof GraphQLIntrospectionError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new GraphQLIntrospectionError(
          `Request timeout after ${this.timeout}ms. The GraphQL endpoint might be unreachable.`
        );
      }

      throw new GraphQLIntrospectionError(
        `Network error during introspection: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parses the introspection result and converts it to our ApiSpec format
   */
  private parseIntrospectionResult(result: IntrospectionResult): ApiSpec {
    const schema = result.data!.__schema;
    const endpoints: Endpoint[] = [];

    // Process Query type (GET operations)
    if (schema.queryType) {
      const queryType = this.findTypeByName(schema.types, schema.queryType.name);
      if (queryType?.fields) {
        for (const field of queryType.fields) {
          if (!field.isDeprecated) {
            endpoints.push(this.createEndpointFromField(field, HttpMethod.GET, 'Query'));
          }
        }
      }
    }

    // Process Mutation type (POST operations)
    if (schema.mutationType) {
      const mutationType = this.findTypeByName(schema.types, schema.mutationType.name);
      if (mutationType?.fields) {
        for (const field of mutationType.fields) {
          if (!field.isDeprecated) {
            endpoints.push(this.createEndpointFromField(field, HttpMethod.POST, 'Mutation'));
          }
        }
      }
    }

    // Process Subscription type (WebSocket/SSE operations)
    if (schema.subscriptionType) {
      const subscriptionType = this.findTypeByName(schema.types, schema.subscriptionType.name);
      if (subscriptionType?.fields) {
        for (const field of subscriptionType.fields) {
          if (!field.isDeprecated) {
            endpoints.push(this.createEndpointFromField(field, HttpMethod.POST, 'Subscription'));
          }
        }
      }
    }

    return endpoints;
  }

  /**
   * Creates an Endpoint object from a GraphQL field
   */
  private createEndpointFromField(field: GraphQLField, method: HttpMethod, operationType: string): Endpoint {
    const path = `/graphql`;
    
    // Build description
    let description = field.description || `${operationType}: ${field.name}`;
    if (field.isDeprecated && field.deprecationReason) {
      description += `\n\n**Deprecated:** ${field.deprecationReason}`;
    }

    // Build request schema for mutations and subscriptions
    const requestSchema = method === HttpMethod.POST ? {
      contentType: 'application/json',
      schema: {
        query: `${operationType.toLowerCase()} { ${field.name}${this.buildFieldArguments(field.args)} ${this.buildReturnTypeSelection(field.type)} }`,
        variables: this.buildVariablesSchema(field.args),
      },
      example: {
        query: `${operationType.toLowerCase()} ${this.buildOperationExample(field)}`,
        variables: this.buildVariablesExample(field.args),
      },
    } : undefined;

    // Build response schema
    const responseSchema = [{
      statusCode: 200,
      contentType: 'application/json',
      schema: {
        data: {
          [field.name]: this.buildTypeSchema(field.type),
        },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              locations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    line: { type: 'number' },
                    column: { type: 'number' },
                  },
                },
              },
              path: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
      example: {
        data: {
          [field.name]: this.buildTypeExample(field.type),
        },
      },
    }];

    // Build parameters for query arguments
    const parameters = field.args.length > 0 ? {
      query: field.args.map(arg => ({
        name: arg.name,
        type: this.getTypeString(arg.type),
        required: this.isNonNullType(arg.type),
        description: arg.description || undefined,
      })),
    } : undefined;

    return {
      method,
      path,
      description,
      auth: this.authInfo,
      requestSchema,
      responseSchema,
      parameters,
      tags: [operationType, 'GraphQL'],
      deprecated: field.isDeprecated,
    };
  }

  /**
   * Finds a type by name in the types array
   */
  private findTypeByName(types: GraphQLType[], name: string): GraphQLType | undefined {
    return types.find(type => type.name === name);
  }

  /**
   * Builds field arguments string for GraphQL query
   */
  private buildFieldArguments(args: GraphQLInputValue[]): string {
    if (args.length === 0) return '';
    
    const argStrings = args.map(arg => {
      const hasDefault = arg.defaultValue !== null && arg.defaultValue !== undefined;
      return hasDefault ? `${arg.name}: $${arg.name}` : `${arg.name}: $${arg.name}`;
    });
    
    return `(${argStrings.join(', ')})`;
  }

  /**
   * Builds return type selection for GraphQL query
   */
  private buildReturnTypeSelection(type: GraphQLType): string {
    const unwrappedType = this.unwrapType(type);
    
    if (unwrappedType.kind === GraphQLTypeKind.SCALAR || unwrappedType.kind === GraphQLTypeKind.ENUM) {
      return '';
    }
    
    // For object types, return a basic selection
    return '{ __typename }';
  }

  /**
   * Builds variables schema for GraphQL operation
   */
  private buildVariablesSchema(args: GraphQLInputValue[]): Record<string, any> {
    const schema: Record<string, any> = {};
    
    for (const arg of args) {
      schema[arg.name] = this.buildTypeSchema(arg.type);
    }
    
    return schema;
  }

  /**
   * Builds variables example for GraphQL operation
   */
  private buildVariablesExample(args: GraphQLInputValue[]): Record<string, any> {
    const example: Record<string, any> = {};
    
    for (const arg of args) {
      if (arg.defaultValue !== null && arg.defaultValue !== undefined) {
        try {
          example[arg.name] = JSON.parse(arg.defaultValue);
        } catch {
          example[arg.name] = arg.defaultValue;
        }
      } else {
        example[arg.name] = this.buildTypeExample(arg.type);
      }
    }
    
    return example;
  }

  /**
   * Builds a complete operation example
   */
  private buildOperationExample(field: GraphQLField): string {
    const operationType = field.name.startsWith('create') || field.name.startsWith('update') || field.name.startsWith('delete') ? 'mutation' : 'query';
    const args = field.args.length > 0 ? `(${field.args.map(arg => `$${arg.name}: ${this.getTypeString(arg.type)}`).join(', ')})` : '';
    
    return `${operationType} ${this.capitalize(field.name)}${args} {
  ${field.name}${this.buildFieldArguments(field.args)} ${this.buildReturnTypeSelection(field.type)}
}`;
  }

  /**
   * Builds a JSON schema representation of a GraphQL type
   */
  private buildTypeSchema(type: GraphQLType): any {
    const unwrapped = this.unwrapType(type);
    
    switch (unwrapped.kind) {
      case GraphQLTypeKind.SCALAR:
        return this.getScalarSchema(unwrapped.name || 'String');
      case GraphQLTypeKind.ENUM:
        return { type: 'string', enum: ['ENUM_VALUE'] };
      case GraphQLTypeKind.OBJECT:
      case GraphQLTypeKind.INTERFACE:
        return { type: 'object', properties: { __typename: { type: 'string' } } };
      case GraphQLTypeKind.UNION:
        return { oneOf: [{ type: 'object' }] };
      default:
        return { type: 'object' };
    }
  }

  /**
   * Builds an example value for a GraphQL type
   */
  private buildTypeExample(type: GraphQLType): any {
    const unwrapped = this.unwrapType(type);
    
    switch (unwrapped.kind) {
      case GraphQLTypeKind.SCALAR:
        return this.getScalarExample(unwrapped.name || 'String');
      case GraphQLTypeKind.ENUM:
        return 'ENUM_VALUE';
      case GraphQLTypeKind.OBJECT:
      case GraphQLTypeKind.INTERFACE:
        return { __typename: unwrapped.name };
      case GraphQLTypeKind.UNION:
        return { __typename: 'UnionType' };
      default:
        return null;
    }
  }

  /**
   * Gets the string representation of a GraphQL type
   */
  private getTypeString(type: GraphQLType): string {
    if (type.kind === GraphQLTypeKind.NON_NULL) {
      return `${this.getTypeString(type.ofType!)}!`;
    }
    
    if (type.kind === GraphQLTypeKind.LIST) {
      return `[${this.getTypeString(type.ofType!)}]`;
    }
    
    return type.name || 'Unknown';
  }

  /**
   * Checks if a type is non-null (required)
   */
  private isNonNullType(type: GraphQLType): boolean {
    return type.kind === GraphQLTypeKind.NON_NULL;
  }

  /**
   * Unwraps a type to get the base type (removes NON_NULL and LIST wrappers)
   */
  private unwrapType(type: GraphQLType): GraphQLType {
    if (type.kind === GraphQLTypeKind.NON_NULL || type.kind === GraphQLTypeKind.LIST) {
      return this.unwrapType(type.ofType!);
    }
    return type;
  }

  /**
   * Gets JSON schema for GraphQL scalar types
   */
  private getScalarSchema(scalarName: string): any {
    switch (scalarName) {
      case 'String':
      case 'ID':
        return { type: 'string' };
      case 'Int':
        return { type: 'integer' };
      case 'Float':
        return { type: 'number' };
      case 'Boolean':
        return { type: 'boolean' };
      case 'DateTime':
        return { type: 'string', format: 'date-time' };
      case 'Date':
        return { type: 'string', format: 'date' };
      case 'JSON':
        return { type: 'object' };
      default:
        return { type: 'string' };
    }
  }

  /**
   * Gets example values for GraphQL scalar types
   */
  private getScalarExample(scalarName: string): any {
    switch (scalarName) {
      case 'String':
        return 'example string';
      case 'ID':
        return 'abc123';
      case 'Int':
        return 42;
      case 'Float':
        return 3.14;
      case 'Boolean':
        return true;
      case 'DateTime':
        return '2023-12-01T12:00:00Z';
      case 'Date':
        return '2023-12-01';
      case 'JSON':
        return { key: 'value' };
      default:
        return 'example';
    }
  }

  /**
   * Capitalizes the first letter of a string
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}