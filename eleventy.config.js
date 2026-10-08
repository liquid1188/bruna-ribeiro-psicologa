import markdownIt from "markdown-it";
const md = markdownIt({ html: true, breaks: false, typographer: true });

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/css": "css", "src/js": "js", "src/admin": "admin", "src/images": "images" });
  eleventyConfig.addGlobalData("buildId", () => Date.now().toString(36));
  eleventyConfig.addFilter("md", (s) => md.render(s || ""));
  eleventyConfig.addFilter("mdInline", (s) => md.renderInline(s || ""));
  // Her highlighted-caption style: each line becomes its own band
  eleventyConfig.addFilter("band", (s) =>
    (s || "").split(/\n+/).map((l) => l.trim()).filter(Boolean)
      .map((l) => `<span>${md.renderInline(l)}</span>`).join(" "));
  eleventyConfig.addCollection("reflexoes", (api) =>
    api.getFilteredByGlob("src/reflexoes/*.md").sort((a, b) => (a.data.ordem || 99) - (b.data.ordem || 99)));
  return { dir: { input: "src", includes: "_includes", output: "_site" }, markdownTemplateEngine: false };
}
