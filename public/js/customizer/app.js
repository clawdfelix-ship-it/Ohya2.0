(function bootCustomizer(global, document) {
  const root = document.getElementById('customizer-app');
  if (!root) return;

  const bootstrapNode = document.getElementById('customizer-bootstrap');
  let bootstrap = {};
  if (bootstrapNode && bootstrapNode.textContent) {
    try {
      bootstrap = JSON.parse(bootstrapNode.textContent);
    } catch (error) {
      bootstrap = {};
    }
  }

  root.dataset.startMode = bootstrap.startMode || 'template';
})(window, document);
