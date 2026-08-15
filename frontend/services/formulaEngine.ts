/**
 * Safe Formula Engine
 * 
 * Provides secure formula evaluation for BOM component calculations.
 * Replaces unsafe eval() with a safe expression parser.
 */


import { logger } from './logger';
export interface FormulaContext {
  pages?: number;
  candidates?: number;
  copies?: number;
  sheetsPerCopy?: number;
  totalSheets?: number;
  wastePercentage?: number;
  quantity?: number;
  [key: string]: number | undefined;
}

export interface FormulaVariable {
  name: string;
  value: number;
}

export interface FormulaEvaluationResult {
  value: number;
  success: boolean;
  error?: string;
  formula?: string;
  context?: Record<string, number>;
}

export class FormulaEngineError extends Error {
  constructor(
    message: string,
    public readonly formula: string,
    public readonly context?: Record<string, number>,
    public readonly type: 'validation' | 'evaluation' | 'security' = 'evaluation'
  ) {
    super(message);
    this.name = 'FormulaEngineError';
  }
}

/**
 * Safe AST-based Formula Engine
 * Provides secure formula evaluation without using eval() or Function constructor
 */
export class SafeFormulaEngine {
  private static readonly ALLOWED_CHARS = /^[0-9+\-*/().\s,Math\.ceilMath\.floorMath\.roundMath\.minMath\.maxMath\.absMath\.sqrtMath\.pow]+$/;
  private static readonly SAFE_FUNCTIONS = ['Math.ceil', 'Math.floor', 'Math.round', 'Math.min', 'Math.max', 'Math.abs', 'Math.sqrt', 'Math.pow'];

  /**
   * Evaluate a formula string with the given context using safe AST parsing
   * @param formula The formula string (e.g., "quantity * pages / 2")
   * @param context The variables to substitute
   * @returns The calculated result or 0 on error
   */
  static evaluate(formula: string, context: FormulaContext): number {
    const result = this.evaluateWithResult(formula, context);
    return result.success ? result.value : 0;
  }

  /**
   * Evaluate a formula and return detailed result with error information
   * @param formula The formula string
   * @param context The variables to substitute
   * @returns Detailed evaluation result
   */
  static evaluateWithResult(formula: string, context: FormulaContext): FormulaEvaluationResult {
    if (!formula || typeof formula !== 'string') {
      return {
        value: 0,
        success: false,
        error: 'Formula is empty or not a string',
        formula
      };
    }

    const trimmedFormula = formula.trim();
    if (!trimmedFormula) {
      return {
        value: 0,
        success: false,
        error: 'Formula is empty',
        formula
      };
    }

    try {
      // Pre-process: Replace variable names with their values
      let expression = trimmedFormula;
      
      // Sort keys by length (longest first) to avoid partial replacements
      const sortedKeys = Object.keys(context)
        .filter(key => key !== undefined && context[key] !== undefined)
        .sort((a, b) => b.length - a.length);

      // Replace each variable with its numeric value
      sortedKeys.forEach(key => {
        const value = context[key];
        if (value !== undefined && value !== null) {
          // Use word boundary regex to avoid partial replacements
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escapedKey}\\b`, 'g');
          expression = expression.replace(regex, value.toString());
        }
      });

      // Validate: Only allow numbers, operators, and safe functions
      // Replace Math. with a placeholder to validate safely
      const testExpression = expression
        .replace(/Math\./g, 'MATH_DOT_');
      
      if (!/^[0-9+\-*/().\s,a-zA-ZMATH_DOT_]+$/.test(testExpression)) {
        const errorMsg = `Invalid characters in formula: ${formula}`;
        console.warn('[SafeFormulaEngine]', errorMsg, { formula, expression, context });
        return {
          value: 0,
          success: false,
          error: 'Invalid characters in formula',
          formula,
          context: this.sanitizeContext(context)
        };
      }

      // Restore Math. functions
      expression = expression.replace(/MATH_DOT_/g, 'Math.');

      // Additional security: Check for dangerous patterns
      if (this.containsDangerousPatterns(expression)) {
        const errorMsg = `Dangerous pattern detected in formula: ${formula}`;
        console.warn('[SafeFormulaEngine]', errorMsg, { formula, expression, context });
        return {
          value: 0,
          success: false,
          error: 'Formula contains dangerous patterns',
          formula,
          context: this.sanitizeContext(context)
        };
      }

      // Use safe AST-based evaluation instead of Function constructor
      const result = this.safeEvaluateExpression(expression);

      // Validate result is a finite number
      if (!isFinite(result) || isNaN(result)) {
        const errorMsg = `Invalid result from formula: ${formula}, result: ${result}`;
        console.warn('[SafeFormulaEngine]', errorMsg, { formula, expression, result, context });
        return {
          value: 0,
          success: false,
          error: 'Formula produced an invalid result',
          formula,
          context: this.sanitizeContext(context)
        };
      }

      return {
        value: result,
        success: true,
        formula,
        context: this.sanitizeContext(context)
      };
    } catch (e) {
      const error = e as Error;
      logger.error('[SafeFormulaEngine] Error evaluating formula:', formula, error);
      return {
        value: 0,
        success: false,
        error: `Evaluation error: ${error.message}`,
        formula,
        context: this.sanitizeContext(context)
      };
    }
  }

  /**
   * Safe AST-based expression evaluator
   * Parses and evaluates mathematical expressions without using eval() or Function
   */
  private static safeEvaluateExpression(expression: string): number {
    // Remove whitespace
    const expr = expression.replace(/\s+/g, '');
    
    // Handle Math function calls
    const mathFunctionResult = this.evaluateMathFunctions(expr);
    if (mathFunctionResult !== null) {
      return mathFunctionResult;
    }

    // Parse basic arithmetic expressions using shunting-yard algorithm
    return this.evaluateArithmetic(expr);
  }

  /**
   * Evaluate Math function calls safely
   */
  private static evaluateMathFunctions(expression: string): number | null {
    let result = expression;
    let hasReplaced = false;
    
    while (true) {
      const mathRegex = /Math\.(\w+)\(([^()]+)\)/;
      const match = mathRegex.exec(result);
      if (!match) break;
      
      const [fullMatch, funcName, argsStr] = match;
      const args = argsStr.split(',').map(arg => this.evaluateArithmetic(arg.trim()));
      
      let funcResult: number;
      switch (funcName) {
        case 'ceil':
          funcResult = Math.ceil(args[0]);
          break;
        case 'floor':
          funcResult = Math.floor(args[0]);
          break;
        case 'round':
          funcResult = Math.round(args[0]);
          break;
        case 'min':
          funcResult = Math.min(...args);
          break;
        case 'max':
          funcResult = Math.max(...args);
          break;
        case 'abs':
          funcResult = Math.abs(args[0]);
          break;
        case 'sqrt':
          funcResult = Math.sqrt(args[0]);
          break;
        case 'pow':
          funcResult = Math.pow(args[0], args[1] || 2);
          break;
        default:
          return null; // Unknown function
      }
      
      result = result.replace(fullMatch, funcResult.toString());
      hasReplaced = true;
    }
    
    if (hasReplaced) {
      return this.evaluateArithmetic(result);
    }
    
    return null;
  }

  /**
   * Evaluate arithmetic expression using shunting-yard algorithm
   */
  private static evaluateArithmetic(expression: string): number {
    let processed = expression;
    if (processed.startsWith('-')) {
      processed = '0' + processed;
    }
    const tokens = this.tokenize(processed);
    const outputQueue: (number | string)[] = [];
    const operatorStack: string[] = [];
    
    const precedence: Record<string, number> = {
      '+': 1,
      '-': 1,
      '*': 2,
      '/': 2
    };
    
    for (const token of tokens) {
      if (typeof token === 'number') {
        outputQueue.push(token);
      } else if (token in precedence) {
        while (
          operatorStack.length > 0 &&
          operatorStack[operatorStack.length - 1] !== '(' &&
          precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
        ) {
          outputQueue.push(operatorStack.pop()!);
        }
        operatorStack.push(token);
      } else if (token === '(') {
        operatorStack.push(token);
      } else if (token === ')') {
        while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
          outputQueue.push(operatorStack.pop()!);
        }
        if (operatorStack[operatorStack.length - 1] === '(') {
          operatorStack.pop();
        }
      }
    }
    
    while (operatorStack.length > 0) {
      outputQueue.push(operatorStack.pop()!);
    }
    
    return this.evaluateRPN(outputQueue);
  }

  /**
   * Tokenize expression into numbers and operators
   */
  private static tokenize(expression: string): (number | string)[] {
    const tokens: (number | string)[] = [];
    let currentNumber = '';
    
    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];
      
      if (char >= '0' && char <= '9' || char === '.') {
        currentNumber += char;
      } else {
        if (currentNumber) {
          tokens.push(parseFloat(currentNumber));
          currentNumber = '';
        }
        
        if (char === '+' || char === '-' || char === '*' || char === '/' || char === '(' || char === ')') {
          tokens.push(char);
        }
        // Ignore other characters (should have been validated earlier)
      }
    }
    
    if (currentNumber) {
      tokens.push(parseFloat(currentNumber));
    }
    
    return tokens;
  }

  /**
   * Evaluate Reverse Polish Notation expression
   */
  private static evaluateRPN(tokens: (number | string)[]): number {
    const stack: number[] = [];
    
    for (const token of tokens) {
      if (typeof token === 'number') {
        stack.push(token);
      } else {
        const b = stack.pop()!;
        const a = stack.pop()!;
        
        switch (token) {
          case '+':
            stack.push(a + b);
            break;
          case '-':
            stack.push(a - b);
            break;
          case '*':
            stack.push(a * b);
            break;
          case '/':
            stack.push(a / b);
            break;
        }
      }
    }
    
    return stack[0] || 0;
  }

  /**
   * Sanitize context for logging (remove sensitive data if any)
   */
  private static sanitizeContext(context: FormulaContext): Record<string, number> {
    const sanitized: Record<string, number> = {};
    Object.keys(context).forEach(key => {
      const value = context[key];
      if (typeof value === 'number' && isFinite(value)) {
        sanitized[key] = value;
      }
    });
    return sanitized;
  }

  /**
   * Check for potentially dangerous patterns in the expression
   */
  private static containsDangerousPatterns(expression: string): boolean {
    const dangerous = [
      'require', 'import', 'module', 'exports', 
      'process', 'Buffer', 'global', 'window', 'document',
      '__', 'eval', 'Function', 'prototype',
      'child_process', 'fs', 'http', 'https',
      '<!--', '-->' // HTML/JS injection patterns
    ];
    
    const lowerExpr = expression.toLowerCase();
    return dangerous.some(pattern => lowerExpr.includes(pattern.toLowerCase()));
  }

  /**
   * Evaluate a BOM formula with standard exam variables
   */
  static evaluateExamFormula(
    formula: string,
    pages: number,
    candidates: number,
    extraCopies: number = 0
  ): number {
    const sheetsPerCopy = Math.ceil(pages / 2);
    const productionCopies = candidates + extraCopies;
    const baseSheets = sheetsPerCopy * productionCopies;
    const wasteSheets = Math.ceil(baseSheets * 0.05);
    const totalSheets = baseSheets + wasteSheets;

    const context: FormulaContext = {
      pages,
      candidates,
      copies: productionCopies,
      sheetsPerCopy,
      totalSheets,
      wastePercentage: 5,
      quantity: productionCopies
    };

    return this.evaluate(formula, context);
  }

  /**
   * Validate a formula string without evaluating it
   * @returns Validation result with detailed error information
   */
  static validate(formula: string): { valid: boolean; error?: string } {
    if (!formula || typeof formula !== 'string') {
      return { valid: false, error: 'Formula is empty or invalid' };
    }

    const trimmedFormula = formula.trim();
    if (!trimmedFormula) {
      return { valid: false, error: 'Formula is empty' };
    }

    // Check for dangerous patterns
    if (this.containsDangerousPatterns(trimmedFormula)) {
      return { valid: false, error: 'Formula contains dangerous patterns' };
    }

    // Check for balanced parentheses
    let depth = 0;
    for (const char of trimmedFormula) {
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (depth < 0) {
        return { valid: false, error: 'Unbalanced parentheses' };
      }
    }
    if (depth !== 0) {
      return { valid: false, error: 'Unbalanced parentheses' };
    }

    return { valid: true };
  }

  /**
   * Get a summary of evaluation errors for monitoring/debugging
   * This can be called periodically to track formula issues in production
   */
  static getErrorSummary(): { totalErrors: number; errorTypes: Record<string, number> } {
    // In a production system, this would query a logging system or metrics store
    // For now, return a placeholder
    return {
      totalErrors: 0,
      errorTypes: {}
    };
  }
}

/**
 * Legacy compatibility function
 * Replaces eval() usage in bomService.ts
 */
export function resolveFormula(formula: string, attributes: Record<string, any>): number {
  // Convert attributes to FormulaContext
  const context: FormulaContext = {};
  
  Object.keys(attributes).forEach(key => {
    const value = attributes[key];
    if (typeof value === 'number' || !isNaN(Number(value))) {
      context[key] = Number(value);
    }
  });

  return SafeFormulaEngine.evaluate(formula, context);
}

export default SafeFormulaEngine;
