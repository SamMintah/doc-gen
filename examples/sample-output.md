---
title: API Documentation
language_tabs:
  - shell: cURL
  - javascript: JavaScript
  - python: Python
toc_footers:
  - <a href='#'>Sign Up for a Developer Key</a>
  - <a href='https://github.com/slatedocs/slate'>Documentation Powered by Slate</a>
includes:
  - errors
search: true
code_clipboard: true
meta:
  - name: description
    content: Documentation for the Sample API
---

# Introduction

Welcome to the Sample API! You can use our API to access Sample API endpoints, which can get information on various resources in our database.

We have language bindings in Shell, JavaScript, and Python! You can view code examples in the dark area to the right, and you can switch the programming language of the examples with the tabs in the top right.

This example API documentation page was created with [Slate](https://github.com/slatedocs/slate). Feel free to edit it and use it as a base for your own API's documentation.

# Authentication

> To authorize, use this code:

```shell
# With shell, you can just pass the correct header with each request
curl "api_endpoint_here" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```javascript
const headers = {
  'Authorization': 'Bearer YOUR_API_KEY'
};

fetch('api_endpoint_here', {
  headers: headers
});
```

```python
import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY'
}

response = requests.get('api_endpoint_here', headers=headers)
```

> Make sure to replace `YOUR_API_KEY` with your API key.

Sample API uses API keys to allow access to the API. You can register a new Sample API key at our [developer portal](http://example.com/developers).

Sample API expects for the API key to be included in all API requests to the server in a header that looks like the following:

`Authorization: Bearer YOUR_API_KEY`

<aside class="notice">
You must replace <code>YOUR_API_KEY</code> with your personal API key.
</aside>

## Bearer Token Authentication

The API uses Bearer token authentication. Include your token in the Authorization header:

`Authorization: Bearer YOUR_TOKEN`

## API Key Authentication

For API key authentication, include your key in the request header:

`X-API-Key: YOUR_API_KEY`

## Basic Authentication

Some endpoints support basic authentication using username and password:

`Authorization: Basic base64(username:password)`

# Users

## Get All Users

```shell
curl "https://api.example.com/v1/users" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```javascript
const response = await fetch('https://api.example.com/v1/users', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});
const users = await response.json();
```

```python
import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY'
}

response = requests.get('https://api.example.com/v1/users', headers=headers)
users = response.json()
```

> The above command returns JSON structured like this:

```json
{
  "data": [
    {
      "id": "usr_123456789",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "admin",
      "created_at": "2023-01-15T10:30:00Z",
      "updated_at": "2023-01-15T10:30:00Z",
      "profile": {
        "avatar_url": "https://example.com/avatars/john.jpg",
        "bio": "Software engineer with 5+ years of experience"
      }
    },
    {
      "id": "usr_987654321",
      "name": "Jane Smith",
      "email": "jane.smith@example.com",
      "role": "user",
      "created_at": "2023-01-14T09:15:00Z",
      "updated_at": "2023-01-16T14:22:00Z",
      "profile": {
        "avatar_url": "https://example.com/avatars/jane.jpg",
        "bio": "Product manager passionate about user experience"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 2,
    "total_pages": 1
  }
}
```

This endpoint retrieves all users with pagination support.

### HTTP Request

`GET https://api.example.com/v1/users`

### Query Parameters

Parameter | Default | Description
--------- | ------- | -----------
page | 1 | The page number to retrieve
per_page | 20 | Number of users per page (max 100)
role | all | Filter by user role (admin, user, moderator)
search | none | Search users by name or email
sort | created_at | Sort field (name, email, created_at, updated_at)
order | desc | Sort order (asc, desc)

<aside class="success">
Remember — authentication is required for this endpoint!
</aside>

## Get a Specific User

```shell
curl "https://api.example.com/v1/users/usr_123456789" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```javascript
const response = await fetch('https://api.example.com/v1/users/usr_123456789', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});
const user = await response.json();
```

```python
import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY'
}

response = requests.get('https://api.example.com/v1/users/usr_123456789', headers=headers)
user = response.json()
```

> The above command returns JSON structured like this:

```json
{
  "data": {
    "id": "usr_123456789",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "role": "admin",
    "created_at": "2023-01-15T10:30:00Z",
    "updated_at": "2023-01-15T10:30:00Z",
    "profile": {
      "avatar_url": "https://example.com/avatars/john.jpg",
      "bio": "Software engineer with 5+ years of experience",
      "location": "San Francisco, CA",
      "website": "https://johndoe.dev"
    },
    "preferences": {
      "theme": "dark",
      "notifications": {
        "email": true,
        "push": false,
        "sms": false
      }
    }
  }
}
```

This endpoint retrieves a specific user by their ID.

### HTTP Request

`GET https://api.example.com/v1/users/<ID>`

### URL Parameters

Parameter | Description
--------- | -----------
ID | The ID of the user to retrieve

## Create a User

```shell
curl -X POST "https://api.example.com/v1/users" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Johnson",
    "email": "alice.johnson@example.com",
    "role": "user",
    "profile": {
      "bio": "UX designer with a passion for accessibility"
    }
  }'
```

```javascript
const userData = {
  name: "Alice Johnson",
  email: "alice.johnson@example.com",
  role: "user",
  profile: {
    bio: "UX designer with a passion for accessibility"
  }
};

const response = await fetch('https://api.example.com/v1/users', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(userData)
});
const newUser = await response.json();
```

```python
import requests
import json

headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
}

user_data = {
    "name": "Alice Johnson",
    "email": "alice.johnson@example.com",
    "role": "user",
    "profile": {
        "bio": "UX designer with a passion for accessibility"
    }
}

response = requests.post(
    'https://api.example.com/v1/users',
    headers=headers,
    data=json.dumps(user_data)
)
new_user = response.json()
```

> The above command returns JSON structured like this:

```json
{
  "data": {
    "id": "usr_456789123",
    "name": "Alice Johnson",
    "email": "alice.johnson@example.com",
    "role": "user",
    "created_at": "2023-01-17T11:45:00Z",
    "updated_at": "2023-01-17T11:45:00Z",
    "profile": {
      "avatar_url": null,
      "bio": "UX designer with a passion for accessibility",
      "location": null,
      "website": null
    },
    "preferences": {
      "theme": "light",
      "notifications": {
        "email": true,
        "push": true,
        "sms": false
      }
    }
  }
}
```

This endpoint creates a new user.

### HTTP Request

`POST https://api.example.com/v1/users`

### Body Parameters

Parameter | Type | Required | Description
--------- | ---- | -------- | -----------
name | string | true | The user's full name
email | string | true | The user's email address (must be unique)
role | string | false | User role (default: "user")
profile | object | false | User profile information
profile.bio | string | false | User biography
profile.location | string | false | User location
profile.website | string | false | User website URL

<aside class="notice">
The email address must be unique across all users.
</aside>

## Update a User

```shell
curl -X PUT "https://api.example.com/v1/users/usr_123456789" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "profile": {
      "bio": "Senior software engineer and team lead",
      "location": "New York, NY"
    }
  }'
```

```javascript
const updateData = {
  name: "John Smith",
  profile: {
    bio: "Senior software engineer and team lead",
    location: "New York, NY"
  }
};

const response = await fetch('https://api.example.com/v1/users/usr_123456789', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(updateData)
});
const updatedUser = await response.json();
```

```python
import requests
import json

headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
}

update_data = {
    "name": "John Smith",
    "profile": {
        "bio": "Senior software engineer and team lead",
        "location": "New York, NY"
    }
}

response = requests.put(
    'https://api.example.com/v1/users/usr_123456789',
    headers=headers,
    data=json.dumps(update_data)
)
updated_user = response.json()
```

> The above command returns JSON structured like this:

```json
{
  "data": {
    "id": "usr_123456789",
    "name": "John Smith",
    "email": "john.doe@example.com",
    "role": "admin",
    "created_at": "2023-01-15T10:30:00Z",
    "updated_at": "2023-01-17T12:15:00Z",
    "profile": {
      "avatar_url": "https://example.com/avatars/john.jpg",
      "bio": "Senior software engineer and team lead",
      "location": "New York, NY",
      "website": "https://johndoe.dev"
    },
    "preferences": {
      "theme": "dark",
      "notifications": {
        "email": true,
        "push": false,
        "sms": false
      }
    }
  }
}
```

This endpoint updates an existing user.

### HTTP Request

`PUT https://api.example.com/v1/users/<ID>`

### URL Parameters

Parameter | Description
--------- | -----------
ID | The ID of the user to update

### Body Parameters

Parameter | Type | Required | Description
--------- | ---- | -------- | -----------
name | string | false | The user's full name
email | string | false | The user's email address
role | string | false | User role
profile | object | false | User profile information
profile.bio | string | false | User biography
profile.location | string | false | User location
profile.website | string | false | User website URL

## Delete a User

```shell
curl -X DELETE "https://api.example.com/v1/users/usr_123456789" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```javascript
const response = await fetch('https://api.example.com/v1/users/usr_123456789', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});

if (response.ok) {
  console.log('User deleted successfully');
}
```

```python
import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY'
}

response = requests.delete(
    'https://api.example.com/v1/users/usr_123456789',
    headers=headers
)

if response.status_code == 204:
    print('User deleted successfully')
```

> The above command returns an empty response with status code 204 (No Content)

This endpoint deletes a specific user.

### HTTP Request

`DELETE https://api.example.com/v1/users/<ID>`

### URL Parameters

Parameter | Description
--------- | -----------
ID | The ID of the user to delete

<aside class="warning">
This action cannot be undone. All user data will be permanently deleted.
</aside>

# Projects

## Get All Projects

```shell
curl "https://api.example.com/v1/projects" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```javascript
const response = await fetch('https://api.example.com/v1/projects', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});
const projects = await response.json();
```

```python
import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY'
}

response = requests.get('https://api.example.com/v1/projects', headers=headers)
projects = response.json()
```

> The above command returns JSON structured like this:

```json
{
  "data": [
    {
      "id": "proj_abc123",
      "name": "Website Redesign",
      "description": "Complete redesign of the company website",
      "status": "active",
      "owner_id": "usr_123456789",
      "created_at": "2023-01-10T08:00:00Z",
      "updated_at": "2023-01-16T15:30:00Z",
      "due_date": "2023-03-15T23:59:59Z",
      "tags": ["design", "frontend", "urgent"],
      "team_members": [
        {
          "user_id": "usr_123456789",
          "role": "owner"
        },
        {
          "user_id": "usr_987654321",
          "role": "contributor"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 1,
    "total_pages": 1
  }
}
```

This endpoint retrieves all projects accessible to the authenticated user.

### HTTP Request

`GET https://api.example.com/v1/projects`

### Query Parameters

Parameter | Default | Description
--------- | ------- | -----------
page | 1 | The page number to retrieve
per_page | 20 | Number of projects per page (max 100)
status | all | Filter by project status (active, completed, archived)
owner_id | none | Filter by project owner ID
tag | none | Filter by project tag

# GraphQL API

## GraphQL Endpoint

```shell
curl -X POST "https://api.example.com/graphql" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetUser($id: ID!) { user(id: $id) { id name email role } }",
    "variables": { "id": "usr_123456789" }
  }'
```

```javascript
const query = `
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
      role
    }
  }
`;

const response = await fetch('https://api.example.com/graphql', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: query,
    variables: { id: 'usr_123456789' }
  })
});
const result = await response.json();
```

```python
import requests
import json

headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
}

query = """
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
    role
  }
}
"""

payload = {
    "query": query,
    "variables": {"id": "usr_123456789"}
}

response = requests.post(
    'https://api.example.com/graphql',
    headers=headers,
    data=json.dumps(payload)
)
result = response.json()
```

> The above command returns JSON structured like this:

```json
{
  "data": {
    "user": {
      "id": "usr_123456789",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "admin"
    }
  }
}
```

Our API also supports GraphQL for more flexible data fetching.

### HTTP Request

`POST https://api.example.com/graphql`

### Available Queries

- `user(id: ID!)` - Get a specific user
- `users(first: Int, after: String)` - Get paginated users
- `project(id: ID!)` - Get a specific project
- `projects(first: Int, after: String)` - Get paginated projects

### Available Mutations

- `createUser(input: CreateUserInput!)` - Create a new user
- `updateUser(id: ID!, input: UpdateUserInput!)` - Update a user
- `deleteUser(id: ID!)` - Delete a user
- `createProject(input: CreateProjectInput!)` - Create a new project

# Webhooks

## Webhook Events

```shell
# Example webhook payload for user.created event
curl -X POST "https://your-app.com/webhooks" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=..." \
  -d '{
    "event": "user.created",
    "data": {
      "id": "usr_123456789",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "created_at": "2023-01-17T10:30:00Z"
    },
    "timestamp": "2023-01-17T10:30:01Z"
  }'
```

```javascript
// Express.js webhook handler example
app.post('/webhooks', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  // Verify signature (recommended)
  if (!verifySignature(payload, signature)) {
    return res.status(401).send('Invalid signature');
  }
  
  const { event, data } = req.body;
  
  switch (event) {
    case 'user.created':
      console.log('New user created:', data.name);
      break;
    case 'user.updated':
      console.log('User updated:', data.name);
      break;
    case 'user.deleted':
      console.log('User deleted:', data.id);
      break;
  }
  
  res.status(200).send('OK');
});
```

```python
# Flask webhook handler example
from flask import Flask, request, jsonify
import hmac
import hashlib

app = Flask(__name__)

@app.route('/webhooks', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Webhook-Signature')
    payload = request.get_data()
    
    # Verify signature (recommended)
    if not verify_signature(payload, signature):
        return jsonify({'error': 'Invalid signature'}), 401
    
    data = request.json
    event = data.get('event')
    
    if event == 'user.created':
        print(f"New user created: {data['data']['name']}")
    elif event == 'user.updated':
        print(f"User updated: {data['data']['name']}")
    elif event == 'user.deleted':
        print(f"User deleted: {data['data']['id']}")
    
    return jsonify({'status': 'success'}), 200
```

Webhooks allow you to receive real-time notifications when events occur in your account.

### Supported Events

Event | Description
----- | -----------
user.created | Triggered when a new user is created
user.updated | Triggered when a user is updated
user.deleted | Triggered when a user is deleted
project.created | Triggered when a new project is created
project.updated | Triggered when a project is updated
project.deleted | Triggered when a project is deleted

### Webhook Security

All webhook requests include an `X-Webhook-Signature` header containing an HMAC SHA256 signature of the request body using your webhook secret. You should verify this signature to ensure the request is from our servers.

# Rate Limiting

```shell
# Rate limit headers in response
HTTP/1.1 200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1609459200
```

The API implements rate limiting to ensure fair usage and system stability.

### Rate Limits

Plan | Requests per Hour | Burst Limit
---- | ----------------- | -----------
Free | 1,000 | 100
Pro | 10,000 | 500
Enterprise | 100,000 | 2,000

### Rate Limit Headers

Header | Description
------ | -----------
X-RateLimit-Limit | The maximum number of requests allowed per hour
X-RateLimit-Remaining | The number of requests remaining in the current window
X-RateLimit-Reset | The time when the rate limit window resets (Unix timestamp)

When you exceed the rate limit, you'll receive a `429 Too Many Requests` response.

# Errors

> Example error response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request data is invalid",
    "details": [
      {
        "field": "email",
        "message": "Email address is required"
      },
      {
        "field": "name",
        "message": "Name must be at least 2 characters long"
      }
    ],
    "request_id": "req_abc123def456"
  }
}
```

The Sample API uses conventional HTTP response codes to indicate the success or failure of an API request. In general: Codes in the `2xx` range indicate success. Codes in the `4xx` range indicate an error that failed given the information provided (e.g., a required parameter was omitted, a charge failed, etc.). Codes in the `5xx` range indicate an error with our servers (these are rare).

### HTTP Status Codes

Error Code | Meaning
---------- | -------
200 | OK -- Everything worked as expected
201 | Created -- The resource was successfully created
204 | No Content -- The request was successful but there's no content to return
400 | Bad Request -- Your request is invalid
401 | Unauthorized -- Your API key is wrong or missing
403 | Forbidden -- You don't have permission to access this resource
404 | Not Found -- The specified resource could not be found
405 | Method Not Allowed -- You tried to access a resource with an invalid method
409 | Conflict -- The request conflicts with the current state of the resource
422 | Unprocessable Entity -- The request was well-formed but contains semantic errors
429 | Too Many Requests -- You're making too many requests! Slow down!
500 | Internal Server Error -- We had a problem with our server. Try again later.
502 | Bad Gateway -- Temporary server error. Try again later.
503 | Service Unavailable -- We're temporarily offline for maintenance. Please try again later.

### Error Response Format

All error responses follow a consistent format with the following fields:

Field | Type | Description
----- | ---- | -----------
error.code | string | A machine-readable error code
error.message | string | A human-readable error message
error.details | array | Additional details about validation errors (optional)
error.request_id | string | A unique identifier for the request (helpful for support)