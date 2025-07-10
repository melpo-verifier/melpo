class MemoryManager {
  constructor(client) {
    this.client = client;
    this.cleanupInterval = 900000;
    this.memoryThreshold = 450;
    this.emergencyThreshold = 500;
    this.lastCleanup = 0;
    this.stats = {
      cleanupCount: 0,
      lastMemoryUsage: 0,
      peakMemoryUsage: 0,
    };
  }

  start() {
    console.log("Starting memory management...");
    setInterval(() => {
      this.performCleanup();
    }, this.cleanupInterval);

    setInterval(() => {
      this.checkMemoryPressure();
    }, 60000);
  }

  checkMemoryPressure() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    this.recordMemoryUsage();

    if (heapUsedMB > this.emergencyThreshold) {
      console.log(`🚨 Emergency memory cleanup triggered: ${heapUsedMB}MB`);
      this.performEmergencyCleanup();
    }
  }

  performCleanup() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    if (heapUsedMB > this.memoryThreshold) {
      console.log(`Memory cleanup triggered: ${heapUsedMB}MB`);

      this.CacheCleanup();

      if (this.client.commandLoader?.clearCache) {
        this.client.commandLoader.clearCache();
      }

      if (global.gc) {
        global.gc();
      }

      this.lastCleanup = Date.now();

      const newMemUsage = Math.round(
        process.memoryUsage().heapUsed / 1024 / 1024,
      );
      const memoryFreed = heapUsedMB - newMemUsage;
      console.log(
        `Memory cleanup completed. Freed: ${memoryFreed}MB, Current: ${newMemUsage}MB`,
      );
    }
  }

  CacheCleanup() {
    let cleared = 0;

    this.client.guilds.cache.forEach((guild) => {
      guild.channels.cache.forEach((channel) => {
        if (channel.messages && channel.messages.cache.size > 50) {
          const oldMessages = channel.messages.cache.filter(
            (msg) => Date.now() - msg.createdTimestamp > 7200000, // 2 hours
          );
          oldMessages.forEach((msg) => {
            channel.messages.cache.delete(msg.id);
            cleared++;
          });
        }
      });

      const inactiveMembers = guild.members.cache.filter(
        (member) =>
          member.id !== this.client.user.id &&
          member.user.bot === false &&
          guild.members.cache.size > 100,
      );

      let removeCount = Math.floor(inactiveMembers.size / 2);
      for (const [id] of inactiveMembers) {
        if (removeCount <= 0) break;
        guild.members.cache.delete(id);
        removeCount--;
        cleared++;
      }

      guild.presences.cache.clear();
    });

    console.log(`Conservative cleanup: cleared ${cleared} items`);
  }

  performEmergencyCleanup() {
    console.log("🚨 Emergency cleanup - keeping only essential caches");

    this.client.guilds.cache.forEach((guild) => {
      guild.channels.cache.forEach((channel) => {
        if (channel.messages) {
          channel.messages.cache.clear();
        }
      });

      const botMember = guild.members.cache.get(this.client.user.id);
      guild.members.cache.clear();
      if (botMember) {
        guild.members.cache.set(this.client.user.id, botMember);
      }

      guild.presences.cache.clear();
      guild.voiceStates.cache.clear();
    });

    const botUser = this.client.users.cache.get(this.client.user.id);
    this.client.users.cache.clear();
    if (botUser) {
      this.client.users.cache.set(this.client.user.id, botUser);
    }

    if (global.gc) {
      for (let i = 0; i < 5; i++) {
        global.gc();
      }
    }

    console.log("Emergency cleanup completed");
  }

  recordMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    this.stats.lastMemoryUsage = heapUsedMB;
    if (heapUsedMB > this.stats.peakMemoryUsage) {
      this.stats.peakMemoryUsage = heapUsedMB;
    }
  }

  getStats() {
    const memUsage = process.memoryUsage();
    return {
      current: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
      },
      stats: this.stats,
      caches: {
        guilds: this.client.guilds.cache.size,
        users: this.client.users.cache.size,
        channels: this.client.channels.cache.size,
      },
      dbCache: global.dbOptimizer ? global.dbOptimizer.getCacheStats() : null,
    };
  }

  triggerCleanup() {
    console.log("Manual memory cleanup triggered");
    this.performCleanup();
  }

  setMemoryThreshold(threshold) {
    this.memoryThreshold = threshold;
    console.log(`Memory threshold updated to ${threshold}MB`);
  }
}

module.exports = MemoryManager;
