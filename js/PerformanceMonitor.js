// Performance monitoring and reporting
const EventEmitter = require("events");

class PerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      commands: new Map(),
      interactions: new Map(),
      errors: new Map(),
      memory: [],
      uptime: Date.now(),
    };

    this.thresholds = {
      commandExecutionTime: 5000, // 5 seconds
      memoryUsage: 512, // MB
      errorRate: 10, // errors per minute
    };

    this.startMonitoring();
  }

  startMonitoring() {
    // Memory monitoring every 30 seconds
    setInterval(() => {
      this.recordMemoryUsage();
    }, 30000);

    // Performance report every 10 minutes
    setInterval(() => {
      this.generatePerformanceReport();
    }, 600000);

    // Error rate check every minute
    setInterval(() => {
      this.checkErrorRate();
    }, 60000);
  }

  recordCommandExecution(commandName, executionTime, success = true) {
    if (!this.metrics.commands.has(commandName)) {
      this.metrics.commands.set(commandName, {
        executions: 0,
        totalTime: 0,
        averageTime: 0,
        errors: 0,
        lastExecuted: null,
      });
    }

    const stats = this.metrics.commands.get(commandName);
    stats.executions++;
    stats.totalTime += executionTime;
    stats.averageTime = stats.totalTime / stats.executions;
    stats.lastExecuted = Date.now();

    if (!success) {
      stats.errors++;
    }

    // Emit warning for slow commands
    if (executionTime > this.thresholds.commandExecutionTime) {
      this.emit("slowCommand", {
        command: commandName,
        executionTime,
        threshold: this.thresholds.commandExecutionTime,
      });
    }
  }

  recordInteraction(type, customId, executionTime, success = true) {
    const key = `${type}:${customId}`;

    if (!this.metrics.interactions.has(key)) {
      this.metrics.interactions.set(key, {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        errors: 0,
      });
    }

    const stats = this.metrics.interactions.get(key);
    stats.count++;
    stats.totalTime += executionTime;
    stats.averageTime = stats.totalTime / stats.count;

    if (!success) {
      stats.errors++;
    }
  }

  recordError(errorType, context = null) {
    const minute = Math.floor(Date.now() / 60000);

    if (!this.metrics.errors.has(minute)) {
      this.metrics.errors.set(minute, new Map());
    }

    const minuteErrors = this.metrics.errors.get(minute);
    if (!minuteErrors.has(errorType)) {
      minuteErrors.set(errorType, { count: 0, contexts: [] });
    }

    const errorStats = minuteErrors.get(errorType);
    errorStats.count++;
    if (context) {
      errorStats.contexts.push(context);
    }
  }

  recordMemoryUsage() {
    const memUsage = process.memoryUsage();
    const memData = {
      timestamp: Date.now(),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    this.metrics.memory.push(memData);

    // Keep only last 24 hours of memory data
    const oneDayAgo = Date.now() - 86400000;
    this.metrics.memory = this.metrics.memory.filter(
      (m) => m.timestamp > oneDayAgo,
    );

    // Emit warning for high memory usage
    if (memData.heapUsed > this.thresholds.memoryUsage) {
      this.emit("highMemoryUsage", memData);
    }
  }

  checkErrorRate() {
    const currentMinute = Math.floor(Date.now() / 60000);
    const minuteErrors = this.metrics.errors.get(currentMinute);

    if (minuteErrors) {
      let totalErrors = 0;
      for (const [stats] of minuteErrors.entries()) {
        totalErrors += stats.count;
      }

      if (totalErrors > this.thresholds.errorRate) {
        this.emit("highErrorRate", {
          minute: currentMinute,
          errorCount: totalErrors,
          threshold: this.thresholds.errorRate,
          breakdown: Array.from(minuteErrors.entries()),
        });
      }
    }
  }

  generatePerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      memory: this.getMemoryStats(),
      commands: this.getCommandStats(),
      interactions: this.getInteractionStats(),
      errors: this.getErrorStats(),
      cache: global.dbOptimizer ? global.dbOptimizer.getCacheStats() : null,
    };

    // console.log('\n📊 PERFORMANCE REPORT');
    // console.log('═'.repeat(50));
    // console.log(`🕐 Uptime: ${report.uptime}`);
    // console.log(`💾 Memory: ${report.memory.current.heapUsed}MB / ${report.memory.current.heapTotal}MB`);
    // console.log(`📈 Commands executed: ${report.commands.totalExecutions}`);
    // console.log(`⚡ Average command time: ${report.commands.averageTime}ms`);
    // console.log(`❌ Total errors (last hour): ${report.errors.lastHourTotal}`);

    if (report.cache) {
      console.log(
        `🗄️ Cache: ${report.cache.cacheSize} entries, ${report.cache.hitRate} hit rate`,
      );
    }

    // console.log('═'.repeat(50));

    // Emit report for external handling
    this.emit("performanceReport", report);

    return report;
  }

  getUptime() {
    const uptimeMs = Date.now() - this.metrics.uptime;
    const days = Math.floor(uptimeMs / 86400000);
    const hours = Math.floor((uptimeMs % 86400000) / 3600000);
    const minutes = Math.floor((uptimeMs % 3600000) / 60000);

    return `${days}d ${hours}h ${minutes}m`;
  }

  getMemoryStats() {
    const current = this.metrics.memory[this.metrics.memory.length - 1] || {};
    const peak = this.metrics.memory.reduce(
      (max, curr) => (curr.heapUsed > max.heapUsed ? curr : max),
      current,
    );

    return { current, peak };
  }

  getCommandStats() {
    let totalExecutions = 0;
    let totalTime = 0;
    let totalErrors = 0;
    let slowestCommand = null;

    for (const [name, stats] of this.metrics.commands.entries()) {
      totalExecutions += stats.executions;
      totalTime += stats.totalTime;
      totalErrors += stats.errors;

      if (!slowestCommand || stats.averageTime > slowestCommand.averageTime) {
        slowestCommand = { name, ...stats };
      }
    }

    return {
      totalExecutions,
      averageTime:
        totalExecutions > 0 ? Math.round(totalTime / totalExecutions) : 0,
      totalErrors,
      slowestCommand,
    };
  }

  getInteractionStats() {
    let totalInteractions = 0;
    let totalTime = 0;

    for (const [stats] of this.metrics.interactions.entries()) {
      totalInteractions += stats.count;
      totalTime += stats.totalTime;
    }

    return {
      totalInteractions,
      averageTime:
        totalInteractions > 0 ? Math.round(totalTime / totalInteractions) : 0,
    };
  }

  getErrorStats() {
    const oneHourAgo = Math.floor((Date.now() - 3600000) / 60000);
    let lastHourTotal = 0;
    const breakdown = new Map();

    for (const [minute, minuteErrors] of this.metrics.errors.entries()) {
      if (minute > oneHourAgo) {
        for (const [errorType, stats] of minuteErrors.entries()) {
          lastHourTotal += stats.count;
          breakdown.set(
            errorType,
            (breakdown.get(errorType) || 0) + stats.count,
          );
        }
      }
    }

    return {
      lastHourTotal,
      breakdown: Array.from(breakdown.entries()),
    };
  }

  // Clean up old data
  cleanup() {
    const oneHourAgo = Math.floor((Date.now() - 3600000) / 60000);

    // Clean old error data
    for (const minute of this.metrics.errors.keys()) {
      if (minute < oneHourAgo) {
        this.metrics.errors.delete(minute);
      }
    }

    console.log("Performance monitor cleaned up old data");
  }
}

// Create global instance
const perfMonitor = new PerformanceMonitor();

// Set up event listeners for performance issues
perfMonitor.on("slowCommand", (data) => {
  console.warn(
    `⚠️ Slow command detected: ${data.command} took ${data.executionTime}ms (threshold: ${data.threshold}ms)`,
  );
});

perfMonitor.on("highMemoryUsage", (data) => {
  console.warn(
    `⚠️ High memory usage: ${data.heapUsed}MB (threshold: ${perfMonitor.thresholds.memoryUsage}MB)`,
  );
});

perfMonitor.on("highErrorRate", (data) => {
  console.warn(
    `⚠️ High error rate: ${data.errorCount} errors in minute ${data.minute} (threshold: ${data.threshold})`,
  );
});

// Cleanup old data every hour
setInterval(() => {
  perfMonitor.cleanup();
}, 3600000);

// Make it globally available
global.perfMonitor = perfMonitor;

module.exports = PerformanceMonitor;
