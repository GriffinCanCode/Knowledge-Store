/**
 * DomProxyExtractor - Extract content using DOM proxy/content frame
 * 
 * This extractor uses a content frame to access the DOM directly
 * and extract content without using the Electron webview API.
 */

import logger from '../../../../utils/logger';
import DomUtils from '../utils/DomUtils';
import WorkerManager from '../../utils/WorkerManager';

// Create a logger instance for this module
const extractorLogger = logger.scope('DomProxyExtractor');

/**
 * Extract content using DOM proxy/content frame
 * @param {Object} contentFrame - Content frame with DOM access
 * @param {string} url - URL to extract from
 * @returns {Object} Extracted content
 */
function extract(contentFrame, url) {
  if (!contentFrame || !contentFrame.contentDocument) {
    extractorLogger.error('Invalid content frame for extraction');
    return Promise.reject(new Error('Invalid content frame for DOM proxy extraction'));
  }
  
  extractorLogger.info(`Extracting content via DOM proxy from ${url}`);
  
  // Try to extract content with worker first if available
  return extractWithWorker(contentFrame, url)
    .catch(error => {
      extractorLogger.warn(`Worker-based extraction failed: ${error.message}, falling back to direct extraction`);
      return extractDirect(contentFrame, url);
    });
}

/**
 * Extract content using worker
 * @param {Object} contentFrame - Content frame with DOM access
 * @param {string} url - URL to extract from
 * @returns {Promise<Object>} Extracted content
 */
async function extractWithWorker(contentFrame, url) {
  const doc = contentFrame.contentDocument;
  
  try {
    // Get the HTML content
    const html = doc.documentElement.outerHTML;
    
    // Check if WorkerManager is initialized
    if (!WorkerManager.isInitialized) {
      return Promise.reject(new Error('Worker system not initialized'));
    }
    
    // Use worker to process DOM
    const result = await WorkerManager.executeTask('process-dom', {
      html,
      url,
      options: {
        clean: true,
        extractMain: true,
        extractHeadings: true,
        extractLinks: true,
        extractMetadata: true,
        createJsonDom: true,
        jsonDomOptions: {
          maxDepth: 5,
          includeContent: true,
          includeAttributes: true
        }
      }
    });
    
    // Add extraction method
    result.extractionMethod = 'domproxy-worker';
    
    return result;
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Extract content directly without worker
 * @param {Object} contentFrame - Content frame with DOM access
 * @param {string} url - URL to extract from
 * @returns {Object} Extracted content
 */
function extractDirect(contentFrame, url) {
  try {
    const doc = contentFrame.contentDocument;
    
    // Clean the DOM to remove unwanted elements
    const cleanedDoc = DomUtils.cleanDom(doc.body, {
      removeSelectors: ['script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'aside'],
      removeHidden: true,
      removeEmpty: true
    });
    
    // Extract main content element
    const mainContent = DomUtils.extractMainContent(cleanedDoc || doc);
    
    // Convert main content to JSON for consistency
    const contentJson = DomUtils.domToJson(mainContent || doc.body, {
      maxDepth: 5,
      includeContent: true,
      includeAttributes: true
    });
    
    // Extract text from main content or document body
    const text = mainContent ? mainContent.textContent : doc.body.textContent;
    
    // Extract headings
    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map(h => ({
        level: parseInt(h.tagName.substring(1), 10),
        text: h.textContent.trim()
      }));
    
    // Extract links
    const links = Array.from(doc.querySelectorAll('a[href]'))
      .filter(a => a.href && a.href.startsWith('http'))
      .map(a => ({
        text: a.textContent.trim(),
        url: a.href,
        title: a.getAttribute('title') || ''
      }))
      .filter((link, index, self) => 
        index === self.findIndex(l => l.url === link.url)
      )
      .slice(0, 100); // Limit to 100 links
    
    // Extract metadata
    const metadata = {};
    doc.querySelectorAll('meta[name], meta[property]').forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property');
      const content = meta.getAttribute('content');
      if (name && content) {
        metadata[name] = content;
      }
    });
    
    // Format final result
    return {
      title: doc.title || '',
      text: text || '',
      html: mainContent ? mainContent.innerHTML : doc.body.innerHTML,
      url: url,
      headings,
      links,
      metadata,
      jsonDom: contentJson,
      extractionMethod: 'domproxy',
      timestamp: new Date().toISOString(),
      extractionSuccess: true
    };
  } catch (error) {
    extractorLogger.error(`DomProxyExtractor error: ${error.message}`);
    throw new Error(`DomProxyExtractor failed: ${error.message}`);
  }
}

// Export methods
const DomProxyExtractor = {
  extract
};

export default DomProxyExtractor; 