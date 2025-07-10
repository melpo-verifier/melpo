class RateLimitError extends Error {
  constructor(rateLimitInfo) {
    super(`Rate limit hit: ${rateLimitInfo.route}`);
    this.name = "RateLimitError";
    this.rateLimitInfo = rateLimitInfo;
  }
}

module.exports = RateLimitError;
