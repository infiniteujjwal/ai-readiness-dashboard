/**
 * AI Readiness Dashboard - Embeddable Script
 * 
 * Usage:
 * <div id="ai-readiness-dashboard" 
 *      data-height="900px"
 *      data-hide-header="false"
 *      data-hide-footer="false"
 *      data-compact="false">
 * </div>
 * <script src="YOUR_DOMAIN/embed.js"></script>
 * 
 * Or with custom container:
 * <script>
 *   window.AIReadinessConfig = {
 *     containerId: 'my-custom-container',
 *     height: '800px',
 *     hideHeader: false,
 *     hideFooter: false,
 *     compact: false,
 *     onLoad: function() { console.log('Dashboard loaded!'); },
 *     onDataChange: function(data) { console.log('Data changed:', data); }
 *   };
 * </script>
 * <script src="YOUR_DOMAIN/embed.js"></script>
 */

(function() {
  'use strict';

  // Get the script's source URL to determine the base URL
  var scripts = document.getElementsByTagName('script');
  var currentScript = scripts[scripts.length - 1];
  var scriptSrc = currentScript.src;
  var baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/'));
  
  // Default configuration
  var defaultConfig = {
    containerId: 'ai-readiness-dashboard',
    height: '900px',
    hideHeader: false,
    hideFooter: false,
    compact: false,
    onLoad: null,
    onDataChange: null
  };

  // Merge with user config if provided
  var config = Object.assign({}, defaultConfig, window.AIReadinessConfig || {});

  // Find the container
  var container = document.getElementById(config.containerId);
  if (!container) {
    console.warn('AI Readiness Dashboard: Container not found with id "' + config.containerId + '"');
    return;
  }

  // Read data attributes from container (override config)
  var dataHeight = container.getAttribute('data-height');
  var dataHideHeader = container.getAttribute('data-hide-header');
  var dataHideFooter = container.getAttribute('data-hide-footer');
  var dataCompact = container.getAttribute('data-compact');

  if (dataHeight) config.height = dataHeight;
  if (dataHideHeader !== null) config.hideHeader = dataHideHeader === 'true';
  if (dataHideFooter !== null) config.hideFooter = dataHideFooter === 'true';
  if (dataCompact !== null) config.compact = dataCompact === 'true';

  // Build the embed URL with parameters
  var embedUrl = baseUrl + '/embed';
  var params = [];
  if (config.hideHeader) params.push('hideHeader=true');
  if (config.hideFooter) params.push('hideFooter=true');
  if (config.compact) params.push('compact=true');
  if (params.length > 0) {
    embedUrl += '?' + params.join('&');
  }

  // Create the iframe
  var iframe = document.createElement('iframe');
  iframe.src = embedUrl;
  iframe.style.width = '100%';
  iframe.style.height = config.height;
  iframe.style.border = 'none';
  iframe.style.borderRadius = '8px';
  iframe.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
  iframe.style.background = '#f8fafc';
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.setAttribute('allow', 'clipboard-write; clipboard-read');
  iframe.setAttribute('loading', 'lazy');
  iframe.id = 'ai-readiness-iframe';

  // Handle iframe load
  iframe.onload = function() {
    if (typeof config.onLoad === 'function') {
      config.onLoad();
    }
  };

  // Listen for messages from the iframe
  window.addEventListener('message', function(event) {
    // Verify the message is from our iframe
    if (event.source !== iframe.contentWindow) return;

    var data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case 'AI_READINESS_LOADED':
        console.log('AI Readiness Dashboard loaded successfully');
        break;
      
      case 'AI_READINESS_DATA_CHANGE':
        if (typeof config.onDataChange === 'function') {
          config.onDataChange(data.payload);
        }
        break;
      
      case 'AI_READINESS_EXPORT':
        console.log('Export triggered:', data.format);
        break;
      
      default:
        break;
    }
  });

  // Append the iframe to the container
  container.innerHTML = '';
  container.appendChild(iframe);

  // Expose API for external control
  window.AIReadinessDashboard = {
    // Send CSV data to the dashboard
    loadCSV: function(csvText) {
      iframe.contentWindow.postMessage({
        type: 'LOAD_CSV_DATA',
        csvText: csvText
      }, '*');
    },

    // Reload the dashboard
    reload: function() {
      iframe.src = iframe.src;
    },

    // Get the iframe element
    getIframe: function() {
      return iframe;
    },

    // Resize the iframe
    resize: function(height) {
      iframe.style.height = height;
    },

    // Update configuration
    updateConfig: function(newConfig) {
      var params = [];
      if (newConfig.hideHeader) params.push('hideHeader=true');
      if (newConfig.hideFooter) params.push('hideFooter=true');
      if (newConfig.compact) params.push('compact=true');
      
      var newUrl = baseUrl + '/embed';
      if (params.length > 0) {
        newUrl += '?' + params.join('&');
      }
      iframe.src = newUrl;
    }
  };

})();

