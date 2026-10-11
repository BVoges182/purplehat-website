export const reportTemplates = [
  {
    key: "wealth-tech",
    name: "WealthTech",
    detail: "The WealthTech dashboard and management reports.",
  },
  {
    key: "purple-hat-demo",
    name: "Purple Hat Demo",
    detail: "The Purple Hat Demo dashboard and management reports.",
  },
];

export function reportTemplateName(key) {
  return reportTemplates.find((item) => item.key === key)?.name || "WealthTech";
}
