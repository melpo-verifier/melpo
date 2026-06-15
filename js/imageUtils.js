const { getPublicUrl } = require("./customizationImages.js");

const resolveImage = (image) => {
  if (!image) 
  { return { embedUrl: null }; }

  if (typeof image === "object" && (image.url || image.key)) {
    const embedUrl = image.url || getPublicUrl(image.key);
    return { embedUrl };
  }

  return { embedUrl: null };
};

module.exports = { resolveImage };
