/**
 * PerformanceMonitor Utility
 * Tracks and reports performance metrics for CFR engine operations
 */

import { PerformanceMetrics, PerformanceReport } from '../types';

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[];
  private activeOperations: Map<string, number>;

  constructor() {
    this.metrics = [];
    this.activeOperations = new Map();
  }

  /**
   * Start tracking an operation
   */
  public startOperation(operationName: string, metadata?: Record<string, any>): string {
    const operationId = `${operationName}_${Date.now()}_${Math.random()}`;
    this.activeOperations.set(operationId, Date.now());

    return operationId;
  }

  /**
   * End tracking an operation
   */
  public endOperation(operationId: string, operationName: string, metadata?: Record<string, any>): void {
    const startTime = this.activeOperations.get(operationId);
    if (!startTime) {
      console.warn(`Operation ${operationId} not found`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    const metric: PerformanceMetrics = {
      operationName,
      startTime,
      endTime,
      duration,
      metadata,
    };

    this.metrics.push(metric);
    this.activeOperations.delete(operationId);
  }

  /**
   * Track a synchronous operation
   */
  public track<T>(operationName: string, fn: () => T, metadata?: Record<string, any>): T {
    const operationId = this.startOperation(operationName, metadata);
    try {
      const result = fn();
      this.endOperation(operationId, operationName, metadata);
      return result;
    } catch (error) {
      this.endOperation(operationId, operationName, { ...metadata, error: String(error) });
      throw error;
    }
  }

  /**
   * Track an asynchronous operation
   */
  public async trackAsync<T>(
    operationName: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const operationId = this.startOperation(operationName, metadata);
    try {
      const result = await fn();
      this.endOperation(operationId, operationName, metadata);
      return result;
    } catch (error) {
      this.endOperation(operationId, operationName, { ...metadata, error: String(error) });
      throw error;
    }
  }

  /**
   * Get all metrics
   */
  public getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get metrics for a specific operation
   */
  public getMetricsForOperation(operationName: string): PerformanceMetrics[] {
    return this.metrics.filter(m => m.operationName === operationName);
  }

  /**
   * Generate performance report
   */
  public generateReport(operationName?: string): PerformanceReport {
    const relevantMetrics = operationName
      ? this.getMetricsForOperation(operationName)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        operations: [],
      };
    }

    const durations = relevantMetrics.map(m => m.duration).sort((a, b) => a - b);

    return {
      totalOperations: relevantMetrics.length,
      averageDuration: this.calculateAverage(durations),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50Duration: this.calculatePercentile(durations, 0.5),
      p95Duration: this.calculatePercentile(durations, 0.95),
      p99Duration: this.calculatePercentile(durations, 0.99),
      operations: relevantMetrics,
    };
  }

  /**
   * Calculate average
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;

    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Print report to console
   */
  public printReport(operationName?: string): void {
    const report = this.generateReport(operationName);

    console.log('\n=== Performance Report ===');
    if (operationName) {
      console.log(`Operation: ${operationName}`);
    }
    console.log(`Total Operations: ${report.totalOperations}`);
    console.log(`Average Duration: ${report.averageDuration.toFixed(2)}ms`);
    console.log(`Min Duration: ${report.minDuration.toFixed(2)}ms`);
    console.log(`Max Duration: ${report.maxDuration.toFixed(2)}ms`);
    console.log(`P50 Duration: ${report.p50Duration.toFixed(2)}ms`);
    console.log(`P95 Duration: ${report.p95Duration.toFixed(2)}ms`);
    console.log(`P99 Duration: ${report.p99Duration.toFixed(2)}ms`);
    console.log('========================\n');
  }

  /**
   * Clear all metrics
   */
  public clear(): void {
    this.metrics = [];
    this.activeOperations.clear();
  }

  /**
   * Get active operations count
   */
  public getActiveOperationsCount(): number {
    return this.activeOperations.size;
  }

  /**
   * Export metrics to JSON
   */
  public exportToJSON(): string {
    return JSON.stringify({
      metrics: this.metrics,
      timestamp: Date.now(),
    }, null, 2);
  }

  /**
   * Import metrics from JSON
   */
  public importFromJSON(json: string): void {
    const data = JSON.parse(json);
    this.metrics = data.metrics || [];
  }
}

/**
 * Global performance monitor instance
 */
export const globalPerformanceMonitor = new PerformanceMonitor();
