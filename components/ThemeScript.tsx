export function ThemeScript() {
  const code = `
(function() {
  try {
    var stored = localStorage.getItem('chip-kings-theme');
    var theme = stored || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();`.trim();
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
