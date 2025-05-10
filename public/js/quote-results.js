function setupWebSocket() {
    const path = window.location.pathname;
    // Use wss:// for HTTPS, ws:// for HTTP
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api${path}`.replace('/results', '');
    
    console.log('Setting up WebSocket connection to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    
    // Rest of WebSocket setup...
} 