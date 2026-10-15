(function attachCustomizerApi(global) {
  async function request(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload && payload.error ? payload.error : 'Customizer API error');
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  global.CustomizerApi = {
    fetchCatalog() {
      return request('/api/customizer/catalog');
    },
    createSession(payload) {
      return request('/api/customizer/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
    },
  };
})(window);
