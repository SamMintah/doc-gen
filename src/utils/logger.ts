import chalk from 'chalk';

export interface LoggerOptions {
  enableDebug?: boolean;
  enableSpinner?: boolean;
}

class Logger {
  private debugEnabled: boolean;
  private spinnerEnabled: boolean;
  private spinnerInterval: NodeJS.Timeout | null = null;
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIndex = 0;
  private currentSpinnerMessage = '';

  constructor(options: LoggerOptions = {}) {
    this.debugEnabled = options.enableDebug ?? process.env.DEBUG === 'true';
    this.spinnerEnabled = options.enableSpinner ?? true;
  }

  /**
   * Log an informational message
   */
  info(message: string): void {
    this.stopSpinner();
    console.log(chalk.blue('ℹ'), message);
  }

  /**
   * Log a success message
   */
  success(message: string): void {
    this.stopSpinner();
    console.log(chalk.green('✓'), message);
  }

  /**
   * Log a warning message
   */
  warn(message: string): void {
    this.stopSpinner();
    console.log(chalk.yellow('⚠'), message);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error): void {
    this.stopSpinner();
    console.error(chalk.red('✗'), message);
    if (error && this.debugEnabled) {
      console.error(chalk.red(error.stack || error.message));
    }
  }

  /**
   * Log a debug message (only shown when debug is enabled)
   */
  debug(message: string): void {
    if (this.debugEnabled) {
      this.stopSpinner();
      console.log(chalk.gray('🐛'), chalk.gray(message));
    }
  }

  /**
   * Start a spinner with a message
   */
  startSpinner(message: string): void {
    if (!this.spinnerEnabled) {
      this.info(message);
      return;
    }

    this.stopSpinner();
    this.currentSpinnerMessage = message;
    
    // Hide cursor
    process.stdout.write('\x1B[?25l');
    
    this.spinnerInterval = setInterval(() => {
      const frame = this.spinnerFrames[this.spinnerIndex];
      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
      
      // Clear line and write spinner
      process.stdout.write('\r\x1B[K');
      process.stdout.write(`${chalk.cyan(frame)} ${this.currentSpinnerMessage}`);
    }, 80);
  }

  /**
   * Update the spinner message
   */
  updateSpinner(message: string): void {
    this.currentSpinnerMessage = message;
  }

  /**
   * Stop the spinner
   */
  stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
      
      // Clear line and show cursor
      process.stdout.write('\r\x1B[K');
      process.stdout.write('\x1B[?25h');
    }
  }

  /**
   * Stop spinner and show success message
   */
  succeedSpinner(message?: string): void {
    this.stopSpinner();
    this.success(message || this.currentSpinnerMessage);
  }

  /**
   * Stop spinner and show error message
   */
  failSpinner(message?: string, error?: Error): void {
    this.stopSpinner();
    this.error(message || this.currentSpinnerMessage, error);
  }

  /**
   * Log a progress update
   */
  progress(current: number, total: number, message?: string): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(percentage);
    const progressMessage = message ? ` ${message}` : '';
    
    this.stopSpinner();
    process.stdout.write('\r\x1B[K');
    process.stdout.write(`${progressBar} ${percentage}%${progressMessage}`);
    
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  /**
   * Create a visual progress bar
   */
  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    const filledBar = chalk.green('█'.repeat(filled));
    const emptyBar = chalk.gray('░'.repeat(empty));
    
    return `[${filledBar}${emptyBar}]`;
  }

  /**
   * Log a section header
   */
  section(title: string): void {
    this.stopSpinner();
    console.log();
    console.log(chalk.bold.cyan(`── ${title} ──`));
  }

  /**
   * Log a subsection
   */
  subsection(title: string): void {
    this.stopSpinner();
    console.log(chalk.bold(`   ${title}`));
  }

  /**
   * Log raw text without formatting
   */
  raw(message: string): void {
    this.stopSpinner();
    console.log(message);
  }

  /**
   * Create a new line
   */
  newLine(): void {
    this.stopSpinner();
    console.log();
  }

  /**
   * Enable or disable debug logging
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Check if debug logging is enabled
   */
  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }
}

// Create a default logger instance
const logger = new Logger();

// Export individual functions for convenience
export const info = (message: string) => logger.info(message);
export const success = (message: string) => logger.success(message);
export const warn = (message: string) => logger.warn(message);
export const error = (message: string, err?: Error) => logger.error(message, err);
export const debug = (message: string) => logger.debug(message);
export const startSpinner = (message: string) => logger.startSpinner(message);
export const updateSpinner = (message: string) => logger.updateSpinner(message);
export const stopSpinner = () => logger.stopSpinner();
export const succeedSpinner = (message?: string) => logger.succeedSpinner(message);
export const failSpinner = (message?: string, err?: Error) => logger.failSpinner(message, err);
export const progress = (current: number, total: number, message?: string) => 
  logger.progress(current, total, message);
export const section = (title: string) => logger.section(title);
export const subsection = (title: string) => logger.subsection(title);
export const raw = (message: string) => logger.raw(message);
export const newLine = () => logger.newLine();
export const setDebugEnabled = (enabled: boolean) => logger.setDebugEnabled(enabled);
export const isDebugEnabled = () => logger.isDebugEnabled();

// Export the Logger class for custom instances
export { Logger };

// Export the default logger instance
export default logger;