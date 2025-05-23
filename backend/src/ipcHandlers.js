/**
 * IPC Handlers
 * Module to centralize all IPC channel handlers for the main process
 */

const { ipcMain } = require('electron');
const { createContextLogger } = require('./utils/logger');
const logger = createContextLogger('IPC');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Import services
const { processPDF } = require('./services/pdfProcessor');
const { processURL } = require('./services/urlProcessor');
const { processYouTube } = require('./services/youtubeProcessor');
const { deleteItem, listItems, semanticSearch: dbSemanticSearch, addItem } = require('./services/database');
const { semanticSearch } = require('./services/search');
const llmService = require('./services/llm');
const toolsService = require('./services/tools');
const config = require('./config');

// Function to get settings file path
function getSettingsPath() {
  // Get the app path for packaged applications
  const app = require('electron').app;
  const userDataPath = app ? app.getPath('userData') : null;
  
  if (userDataPath) {
    const settingsPath = path.join(userDataPath, 'settings.json');
    logger.debug(`Using settings path: ${settingsPath}`);
    return settingsPath;
  }
  
  // Fallback for development
  const devPath = path.join(__dirname, '..', 'settings.json');
  logger.debug(`Using development settings path: ${devPath}`);
  return devPath;
}

// Function to load settings
function loadSettings() {
  const settingsPath = getSettingsPath();
  
  try {
    logger.info(`Loading settings from: ${settingsPath}`);
    
    if (fs.existsSync(settingsPath)) {
      const settingsJson = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(settingsJson);
      
      // Log API key status (with redaction)
      if (settings && settings.apiKeys) {
        const apiKeyStatus = {};
        Object.keys(settings.apiKeys).forEach(service => {
          const key = settings.apiKeys[service];
          apiKeyStatus[service] = key ? `Set (${key.length > 8 ? key.substring(0, 4) + '...' + key.slice(-4) : '***'})` : 'Not set';
        });
        logger.debug('Settings loaded with API keys:', apiKeyStatus);
      }
      
      return settings;
    } else {
      logger.info('Settings file does not exist, returning defaults');
    }
  } catch (error) {
    logger.error('Error loading settings:', error);
  }
  
  // Return default settings if file doesn't exist or can't be read
  const defaultSettings = {
    apiKeys: {
      google: process.env.GOOGLE_API_KEY || '',
      openai: process.env.OPENAI_API_KEY || '',
      anthropic: process.env.ANTHROPIC_API_KEY || '',
      openrouter: process.env.OPENROUTER_API_KEY || ''
    },
    models: {
      defaultChatModel: process.env.LLM_MODEL || 'gemini-2.0-flash',
      defaultEmbeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
    },
    interface: {
      darkMode: true,
      fontSize: 'medium',
      codeHighlighting: true
    },
    advanced: {
      debugMode: false,
      maxTokens: 2048,
      temperature: 0.7
    }
  };
  
  // Log default API keys (with redaction)
  const apiKeyStatus = {};
  Object.keys(defaultSettings.apiKeys).forEach(service => {
    const key = defaultSettings.apiKeys[service];
    apiKeyStatus[service] = key ? `Set (${key.length > 8 ? key.substring(0, 4) + '...' + key.slice(-4) : '***'})` : 'Not set';
  });
  logger.debug('Using default settings with API keys:', apiKeyStatus);
  
  return defaultSettings;
}

// Function to save settings
function saveSettings(settings) {
  const settingsPath = getSettingsPath();
  
  try {
    logger.info(`Saving settings to: ${settingsPath}`);
    
    // Log API key status (with redaction)
    if (settings && settings.apiKeys) {
      const apiKeyStatus = {};
      Object.keys(settings.apiKeys).forEach(service => {
        const key = settings.apiKeys[service];
        apiKeyStatus[service] = key ? `Set (${key.length > 8 ? key.substring(0, 4) + '...' + key.slice(-4) : '***'})` : 'Not set';
      });
      logger.debug('Saving API keys:', apiKeyStatus);
    }
    
    // Ensure directory exists
    const settingsDir = path.dirname(settingsPath);
    if (!fs.existsSync(settingsDir)) {
      logger.debug(`Creating settings directory: ${settingsDir}`);
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    
    // Write settings to file
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    logger.info('Settings file written successfully');
    
    // Update environment variables for active session
    if (settings.apiKeys) {
      logger.debug('Updating environment variables with API keys');
      
      if (settings.apiKeys.google) {
        const oldKey = process.env.GOOGLE_API_KEY ? 
          (process.env.GOOGLE_API_KEY.length > 8 ? 
            process.env.GOOGLE_API_KEY.substring(0, 4) + '...' + process.env.GOOGLE_API_KEY.slice(-4) : '***') : 'Not set';
        
        process.env.GOOGLE_API_KEY = settings.apiKeys.google;
        
        const newKey = process.env.GOOGLE_API_KEY ? 
          (process.env.GOOGLE_API_KEY.length > 8 ? 
            process.env.GOOGLE_API_KEY.substring(0, 4) + '...' + process.env.GOOGLE_API_KEY.slice(-4) : '***') : 'Not set';
            
        logger.info(`Updated Google API key: ${oldKey} -> ${newKey}`);
      }
      
      if (settings.apiKeys.openai) {
        const oldKey = process.env.OPENAI_API_KEY ? 
          (process.env.OPENAI_API_KEY.length > 8 ? 
            process.env.OPENAI_API_KEY.substring(0, 4) + '...' + process.env.OPENAI_API_KEY.slice(-4) : '***') : 'Not set';
            
        process.env.OPENAI_API_KEY = settings.apiKeys.openai;
        
        const newKey = process.env.OPENAI_API_KEY ? 
          (process.env.OPENAI_API_KEY.length > 8 ? 
            process.env.OPENAI_API_KEY.substring(0, 4) + '...' + process.env.OPENAI_API_KEY.slice(-4) : '***') : 'Not set';
            
        logger.info(`Updated OpenAI API key: ${oldKey} -> ${newKey}`);
      }
      
      if (settings.apiKeys.anthropic) {
        const oldKey = process.env.ANTHROPIC_API_KEY ? 
          (process.env.ANTHROPIC_API_KEY.length > 8 ? 
            process.env.ANTHROPIC_API_KEY.substring(0, 4) + '...' + process.env.ANTHROPIC_API_KEY.slice(-4) : '***') : 'Not set';
            
        process.env.ANTHROPIC_API_KEY = settings.apiKeys.anthropic;
        
        const newKey = process.env.ANTHROPIC_API_KEY ? 
          (process.env.ANTHROPIC_API_KEY.length > 8 ? 
            process.env.ANTHROPIC_API_KEY.substring(0, 4) + '...' + process.env.ANTHROPIC_API_KEY.slice(-4) : '***') : 'Not set';
            
        logger.info(`Updated Anthropic API key: ${oldKey} -> ${newKey}`);
      }
      
      if (settings.apiKeys.openrouter) {
        const oldKey = process.env.OPENROUTER_API_KEY ? 
          (process.env.OPENROUTER_API_KEY.length > 8 ? 
            process.env.OPENROUTER_API_KEY.substring(0, 4) + '...' + process.env.OPENROUTER_API_KEY.slice(-4) : '***') : 'Not set';
            
        process.env.OPENROUTER_API_KEY = settings.apiKeys.openrouter;
        
        const newKey = process.env.OPENROUTER_API_KEY ? 
          (process.env.OPENROUTER_API_KEY.length > 8 ? 
            process.env.OPENROUTER_API_KEY.substring(0, 4) + '...' + process.env.OPENROUTER_API_KEY.slice(-4) : '***') : 'Not set';
            
        logger.info(`Updated OpenRouter API key: ${oldKey} -> ${newKey}`);
      }
    }
    
    if (settings.models) {
      if (settings.models.defaultChatModel) {
        logger.info(`Updated default chat model: ${process.env.LLM_MODEL || 'Not set'} -> ${settings.models.defaultChatModel}`);
        process.env.LLM_MODEL = settings.models.defaultChatModel;
      }
      
      if (settings.models.defaultEmbeddingModel) {
        logger.info(`Updated default embedding model: ${process.env.EMBEDDING_MODEL || 'Not set'} -> ${settings.models.defaultEmbeddingModel}`);
        process.env.EMBEDDING_MODEL = settings.models.defaultEmbeddingModel;
      }
    }
    
    return true;
  } catch (error) {
    logger.error('Error saving settings:', error);
    return false;
  }
}

// Function to test an API key
async function testApiKey(provider, apiKey) {
  try {
    switch (provider) {
      case 'google':
        // Temporarily set the API key
        const originalGoogleKey = process.env.GOOGLE_API_KEY;
        process.env.GOOGLE_API_KEY = apiKey;
        
        try {
          // Test with a simple embedding request
          const isValid = await llmService.checkApiKey();
          return { success: isValid, provider };
        } finally {
          // Restore the original API key
          process.env.GOOGLE_API_KEY = originalGoogleKey;
        }
        
      case 'openai':
        // For OpenAI, we would need to implement a test
        // This is a placeholder for now
        return { success: true, message: 'OpenAI API key validation is not implemented yet', provider };
        
      case 'anthropic':
        // For Anthropic, we would need to implement a test
        // This is a placeholder for now
        return { success: true, message: 'Anthropic API key validation is not implemented yet', provider };
        
      case 'openrouter':
        // For OpenRouter, we would need to implement a test
        // This is a placeholder for now
        return { success: true, message: 'OpenRouter API key validation is not implemented yet', provider };
        
      default:
        return { success: false, error: `Unknown provider: ${provider}`, provider };
    }
  } catch (error) {
    logger.error(`Error testing ${provider} API key:`, error);
    return { success: false, error: error.message, provider };
  }
}

// Function to find the story directory
function findStoryDirectory() {
  // Get the app path for packaged applications
  const app = require('electron').app;
  const appPath = app ? app.getAppPath() : null;
  const appResourcesPath = app ? app.getPath('exe').replace(/[^\/]*$/, '') : null;
  const userDataPath = app ? app.getPath('userData') : null;

  logger.info(`Looking for story directory with appPath: ${appPath}`);
  logger.info(`Looking for story directory with resources path: ${appResourcesPath}`);
  logger.info(`Looking for story directory with userData path: ${userDataPath}`);

  const possiblePaths = [
    // User data path (prioritized as it contains the copied files)
    userDataPath ? path.join(userDataPath, '@story') : null,
    
    // Development paths
    path.join(__dirname, '..', '@story'),
    path.join(__dirname, '@story'),
    path.join(process.cwd(), '@story'),
    path.join(process.cwd(), 'backend', '@story'),
    path.join(process.cwd(), 'dist', '@story'),
    path.join(process.cwd(), 'dist', 'backend', '@story'),
    
    // Packaged application paths
    appPath ? path.join(appPath, '@story') : null,
    appPath ? path.join(appPath, 'backend', '@story') : null, 
    appPath ? path.join(appPath, 'dist', '@story') : null,
    appPath ? path.join(appPath, 'dist', 'backend', '@story') : null,
    appPath ? path.join(appPath, 'resources', '@story') : null,
    
    // Resource paths in macOS app bundle
    appResourcesPath ? path.join(appResourcesPath, '@story') : null,
    appResourcesPath ? path.join(appResourcesPath, 'backend', '@story') : null,
    appResourcesPath ? path.join(appResourcesPath, 'resources', '@story') : null,
    appResourcesPath ? path.join(appResourcesPath, 'app.asar', '@story') : null,
    appResourcesPath ? path.join(appResourcesPath, 'app.asar.unpacked', '@story') : null,
    
    // Additional paths for resources in packaged app
    process.resourcesPath ? path.join(process.resourcesPath, '@story') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', '@story') : null
  ].filter(Boolean); // Filter out null paths

  // Log the paths we're checking
  logger.info(`Checking ${possiblePaths.length} possible story directory paths`);

  for (const dirPath of possiblePaths) {
    // Log individual path check
    logger.debug(`Checking story directory path: ${dirPath}`);
    
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        if (jsonFiles.length > 0) {
          logger.info(`Found story directory at: ${dirPath} with ${jsonFiles.length} JSON files`);
          return dirPath;
        } else {
          logger.debug(`Directory exists but contains no JSON files: ${dirPath}`);
        }
      }
    } catch (err) {
      logger.debug(`Error checking path ${dirPath}: ${err.message}`);
    }
  }

  logger.error('Story directory not found in any of the expected locations');
  return null;
}

/**
 * Server-side fetch to bypass CSP restrictions
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Promise resolving to content data
 */
async function serverFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      logger.info(`Server-side fetch for ${url}`);
      const parsedUrl = new URL(url);
      
      // Select protocol handler
      const requestModule = parsedUrl.protocol === 'https:' ? https : http;
      
      // Configure request options
      const requestOptions = {
        method: 'GET',
        headers: {
          'User-Agent': options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: options.timeout || 30000
      };
      
      // Make the request
      const req = requestModule.request(url, requestOptions, (res) => {
        const chunks = [];
        
        // Get content type for processing
        const contentType = res.headers['content-type'];
        
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          logger.info(`Following redirect to ${res.headers.location}`);
          // Use relative URL resolution if needed
          const redirectUrl = new URL(res.headers.location, url).toString();
          return serverFetch(redirectUrl, options)
            .then(resolve)
            .catch(reject);
        }
        
        // Handle non-successful status codes
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP error status: ${res.statusCode}`));
        }
        
        // Collect data
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        // Process data on end
        res.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            const data = buffer.toString('utf8');
            
            // Ensure all returned data is fully serializable for IPC communication
            const safeHeaders = {};
            // Convert headers to a plain object with string values
            for (const [key, value] of Object.entries(res.headers)) {
              safeHeaders[key] = typeof value === 'string' ? value : String(value);
            }
            
            // Extremely aggressive truncation to guarantee serialization
            const maxDataSize = 2 * 1024 * 1024; // 2MB max (reduced from 5MB)
            const truncatedData = data.length > maxDataSize ? 
              data.substring(0, maxDataSize) + '... [truncated due to size]' : 
              data;
            
            // Create a very minimal response with only essential data as plain strings
            // This is the safest approach to avoid any serialization issues
            const safeResponse = {
              data: truncatedData,
              contentType: String(contentType || ''),
              url: String(res.responseUrl || url || ''),
              statusCode: Number(res.statusCode) || 0,
              // Don't include full headers, just a few important ones
              contentLength: safeHeaders['content-length'] ? String(safeHeaders['content-length']) : '',
              contentType: safeHeaders['content-type'] ? String(safeHeaders['content-type']) : '',
              server: safeHeaders['server'] ? String(safeHeaders['server']) : '',
              timestamp: new Date().toISOString()
            };
            
            resolve(safeResponse);
          } catch (err) {
            reject(new Error(`Error processing response: ${err.message}`));
          }
        });
      });
      
      // Handle request errors
      req.on('error', (err) => {
        logger.error(`Server fetch error: ${err.message}`);
        reject(new Error(`Request failed: ${err.message}`));
      });
      
      // Handle timeout
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out after ${options.timeout || 30000}ms`));
      });
      
      // End the request
      req.end();
    } catch (err) {
      logger.error(`Server fetch error: ${err.message}`);
      reject(err);
    }
  });
}

/**
 * Initialize all IPC handlers
 * This function sets up all the IPC channels between the main and renderer processes
 */
function initializeIpcHandlers() {
  logger.info('Initializing IPC handlers');

  // Initialize tools service
  toolsService.initialize();

  // Safe handler registration function to avoid conflicts
  const safelyRegisterHandler = (channel, handler) => {
    try {
      // Attempt to register the handler
      ipcMain.handle(channel, handler);
      logger.debug(`Registered IPC handler for: ${channel}`);
    } catch (error) {
      // If it fails because the handler already exists, log it but don't fail
      if (error.message && error.message.includes('Attempted to register a second handler')) {
        logger.info(`Handler for ${channel} already registered, skipping`);
      } else {
        // For other errors, log and rethrow
        logger.error(`Error registering handler for ${channel}:`, error);
        throw error;
      }
    }
  };

  // Health check handler
  safelyRegisterHandler('health-check', async () => {
    try {
      logger.debug('Health check requested');
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch (error) {
      logger.error('Health check failed:', error);
      return { status: 'error', error: error.message };
    }
  });

  // Get config
  safelyRegisterHandler('get-config', async () => {
    try {
      logger.debug('Config requested');
      
      // Check if API key is valid
      const isApiKeyValid = await llmService.checkApiKey();
      
      return { 
        llmModel: process.env.LLM_MODEL || 'gemini-2.0-flash',
        embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-005',
        apiKeyValid: isApiKeyValid
      };
    } catch (error) {
      logger.error('Error retrieving config:', error);
      return { error: error.message };
    }
  });

  // Process PDF
  safelyRegisterHandler('process-pdf', async (event, filePath) => {
    try {
      logger.info(`Processing PDF: ${filePath}`);
      const result = await processPDF(filePath);
      logger.debug('PDF processing completed successfully');
      return { success: true, result };
    } catch (error) {
      logger.error('Error processing PDF:', error);
      return { success: false, error: error.message };
    }
  });

  // Process URL
  safelyRegisterHandler('process-url', async (event, url) => {
    try {
      logger.info(`Processing URL: ${url}`);
      const result = await processURL(url);
      logger.debug('URL processing completed successfully');
      return { success: true, result };
    } catch (error) {
      logger.error('Error processing URL:', error);
      return { success: false, error: error.message };
    }
  });

  // Process YouTube
  safelyRegisterHandler('process-youtube', async (event, url) => {
    try {
      logger.info(`Processing YouTube: ${url}`);
      const result = await processYouTube(url);
      logger.debug('YouTube processing completed successfully');
      return { success: true, result };
    } catch (error) {
      logger.error('Error processing YouTube:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete item
  safelyRegisterHandler('delete-item', async (event, id) => {
    try {
      logger.info(`Deleting item: ${id}`);
      const result = await deleteItem(id);
      logger.debug('Item deleted successfully');
      return { success: true, result };
    } catch (error) {
      logger.error('Error deleting item:', error);
      return { success: false, error: error.message };
    }
  });

  // List items
  safelyRegisterHandler('list-items', async (event) => {
    try {
      logger.info('Listing items');
      const items = await listItems();
      logger.debug(`Listed ${items.length} items successfully`);
      return { success: true, items };
    } catch (error) {
      logger.error('Error listing items:', error);
      return { success: false, error: error.message };
    }
  });

  // Save browser content
  safelyRegisterHandler('save-browser-content', async (event, content) => {
    try {
      logger.info(`Saving browser content from: ${content.url}`);
      
      if (!content || !content.text || !content.title) {
        return { success: false, error: 'Invalid content: missing required fields' };
      }
      
      // Generate a unique ID for the browser content
      const id = `browser-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Process text for vector DB
      // Extract text chunks (simplified for now)
      const chunkSize = 1000; // Characters per chunk
      const textChunks = [];
      
      for (let i = 0; i < content.text.length; i += chunkSize) {
        const chunk = content.text.slice(i, i + chunkSize);
        if (chunk.trim().length > 0) {
          textChunks.push(chunk);
        }
      }
      
      // Prepare metadata
      const metadata = {
        url: content.url,
        domain: new URL(content.url).hostname,
        browser_saved: true,
        timestamp: new Date().toISOString(),
        link_count: content.links ? content.links.length : 0,
        ...content.metadata
      };
      
      // Prepare the item to save
      const item = {
        id,
        title: content.title || 'Untitled Browser Page',
        source_type: 'browser',
        source_identifier: content.url,
        extracted_text: content.text,
        text_chunks: textChunks,
        summary: `Browser page: ${content.title}`,
        metadata: JSON.stringify(metadata),
        created_at: new Date().toISOString()
      };
      
      // We'll get embeddings for this content during the addItem process
      // This requires the embedding API to be configured and working
      
      // Save to vector DB
      const result = await addItem(item);
      
      logger.info(`Successfully saved browser content from ${content.url}`);
      return { success: true, id };
    } catch (error) {
      logger.error('Error saving browser content:', error);
      return { success: false, error: error.message };
    }
  });

  // Semantic search
  safelyRegisterHandler('search', async (event, query, limit = 5) => {
    try {
      logger.info(`Searching for: "${query}"`);
      const results = await semanticSearch(query, limit);
      logger.debug(`Search completed with ${results.length} results`);
      return { success: true, results };
    } catch (error) {
      logger.error('Error performing search:', error);
      return { success: false, error: error.message };
    }
  });

  // List all files
  safelyRegisterHandler('list-all-files', async (event, params = {}) => {
    try {
      logger.info('List all files request received', params);
      
      // Execute the listAllFiles tool
      const result = await toolsService.listAllFiles(params);
      
      logger.debug(`List all files completed with ${result.totalItems} items`);
      return { success: true, ...result };
    } catch (error) {
      logger.error('Error listing all files:', error);
      return { success: false, error: error.message };
    }
  });
  
  // List files by type
  safelyRegisterHandler('list-files-by-type', async (event, params) => {
    try {
      logger.info(`List files by type request received: ${params.fileType}`);
      
      // Execute the listFilesByType tool
      const result = await toolsService.listFilesByType(params);
      
      logger.debug(`List files by type completed with ${result.totalItems} items`);
      return { success: true, ...result };
    } catch (error) {
      logger.error('Error listing files by type:', error);
      return { success: false, error: error.message };
    }
  });
  
  // List files with content
  safelyRegisterHandler('list-files-with-content', async (event, params) => {
    try {
      logger.info(`List files with content request received: ${params.contentQuery}`);
      
      // Execute the listFilesWithContent tool
      const result = await toolsService.listFilesWithContent(params);
      
      logger.debug(`List files with content completed with ${result.totalItems} items`);
      return { success: true, ...result };
    } catch (error) {
      logger.error('Error listing files with content:', error);
      return { success: false, error: error.message };
    }
  });
  
  // List recent files
  safelyRegisterHandler('list-recent-files', async (event, params = {}) => {
    try {
      logger.info(`List recent files request received: ${params.days} days`);
      
      // Execute the listRecentFiles tool
      const result = await toolsService.listRecentFiles(params);
      
      logger.debug(`List recent files completed with ${result.totalItems} items`);
      return { success: true, ...result };
    } catch (error) {
      logger.error('Error listing recent files:', error);
      return { success: false, error: error.message };
    }
  });

  // Get available tools
  safelyRegisterHandler('get-available-tools', async (event) => {
    try {
      logger.info('Retrieving available tools');
      const tools = toolsService.getAvailableTools();
      logger.debug(`Retrieved ${tools.length} available tools`);
      return { success: true, tools };
    } catch (error) {
      logger.error('Error retrieving available tools:', error);
      return { success: false, error: error.message };
    }
  });

  // Execute tool
  safelyRegisterHandler('execute-tool', async (event, toolName, params) => {
    try {
      logger.info(`Executing tool: ${toolName}`);
      const result = await toolsService.executeTool(toolName, params);
      logger.debug(`Tool execution completed: ${toolName}`);
      return result; // Result already has success property
    } catch (error) {
      logger.error(`Error executing tool ${toolName}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Generate document summary
  safelyRegisterHandler('generate-summary', async (event, documentId, content, title) => {
    try {
      logger.info(`Generating summary for document: ${documentId}`);
      const result = await toolsService.executeTool('summary', { documentId, content, title });
      logger.debug(`Summary generation completed for document: ${documentId}`);
      return result; // Result already has success property
    } catch (error) {
      logger.error(`Error generating summary for document ${documentId}:`, error);
      return { success: false, error: error.message };
    }
  });

  // LLM chat
  safelyRegisterHandler('chat', async (event, params) => {
    try {
      logger.info(`Chat request received with model: ${params.model || 'default'}`);
      
      // Add this: Load fresh settings to get the latest API key
      const currentSettings = loadSettings();
      
      // Ensure GOOGLE_API_KEY is available from environment or settings
      if (!process.env.GOOGLE_API_KEY && currentSettings && currentSettings.apiKeys && currentSettings.apiKeys.google) {
        logger.info('Setting GOOGLE_API_KEY from settings');
        process.env.GOOGLE_API_KEY = currentSettings.apiKeys.google;
      }
      
      // Make sure our environment variable is passed to child processes
      process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
      
      try {
        const result = await llmService.chat(params);
        logger.debug('Chat response generated successfully');
        return result;
      } catch (error) {
        // Handle API key errors more gracefully
        if (error.message && error.message.includes('Google API key is not configured')) {
          // This is an expected error when the API key is missing
          logger.warn('API key not configured for chat - this will be handled by the UI');
          throw error; // Still throw so the UI can handle it
        }
        
        // Log other errors as actual errors
        logger.error('Error in chat:', error);
        throw error;
      }
    } catch (error) {
      // Don't duplicate error logging here if it was already logged above
      if (!error.message || !error.message.includes('Google API key is not configured')) {
        logger.error('Error in chat:', error);
      }
      throw error;
    }
  });

  // Generate embeddings
  safelyRegisterHandler('generate-embeddings', async (event, params) => {
    try {
      logger.info('Embeddings generation requested');
      
      if (!params || !params.text) {
        throw new Error('Text is required for embedding generation');
      }
      
      const result = await llmService.generateEmbeddings(params.text, params.model);
      logger.debug('Embeddings generated successfully');
      return result;
    } catch (error) {
      logger.error('Error generating embeddings:', error);
      throw error; // Let the frontend handle this error
    }
  });

  // Generate local embeddings (for tab grouping)
  safelyRegisterHandler('generate-local-embedding', async (event, params) => {
    try {
      logger.info('Local embedding generation requested');
      
      if (!params || !params.text) {
        throw new Error('Text is required for local embedding generation');
      }
      
      // Use the local embedding service
      const { localEmbeddingService } = require('./services/localEmbedding');
      const embedding = await localEmbeddingService.generateEmbedding(params.text);
      
      logger.debug('Local embedding generated successfully');
      return { 
        embedding: embedding,
        dimensions: embedding.length,
        model: 'local'
      };
    } catch (error) {
      logger.error('Error generating local embedding:', error);
      throw error; // Let the frontend handle this error
    }
  });

  // Execute tool call (from LLM)
  safelyRegisterHandler('execute-tool-call', async (event, params) => {
    try {
      logger.info(`Tool call execution requested: ${params.toolName}`);
      
      if (!params || !params.toolName) {
        throw new Error('Tool name is required for tool call execution');
      }
      
      const result = await llmService.executeToolCall(params);
      logger.debug(`Tool call executed successfully: ${params.toolName}`);
      return result;
    } catch (error) {
      logger.error(`Error executing tool call: ${params?.toolName || 'unknown'}`, error);
      throw error; // Let the frontend handle this error
    }
  });

  // Semantic RAG search (advanced with options)
  safelyRegisterHandler('semantic-search', async (event, query, queryVector, options = {}) => {
    try {
      logger.info(`Advanced semantic search for: "${query}"`);
      
      // Generate embeddings if queryVector not provided
      let vectorToUse = queryVector;
      if (!vectorToUse && query) {
        logger.debug('Generating embeddings for semantic search query');
        const embeddingResult = await llmService.generateEmbeddings(query);
        vectorToUse = embeddingResult.embedding;
      }
      
      if (!vectorToUse) {
        throw new Error('Either query or queryVector must be provided for semantic search');
      }
      
      // Perform semantic search with our advanced implementation
      const results = await dbSemanticSearch(query, vectorToUse, options);
      logger.debug(`Advanced semantic search completed with ${results.length} results`);
      return { success: true, results };
    } catch (error) {
      logger.error('Error performing advanced semantic search:', error);
      return { success: false, error: error.message };
    }
  });

  // Get story chapters
  safelyRegisterHandler('get-story-chapters', async () => {
    try {
      logger.info('Fetching story chapters');
      const storyDir = findStoryDirectory();
      
      if (!storyDir) {
        logger.error('Story directory not found');
        return [];
      }
      
      const files = fs.readdirSync(storyDir);
      const chapters = files
        .filter(file => file.endsWith('.json'))
        .map((file, index) => {
          try {
            // Try to read the file to get the title from the JSON
            const content = fs.readFileSync(path.join(storyDir, file), 'utf8');
            const chapterData = JSON.parse(content);
            
            return {
              id: chapterData.chapter || index + 1,
              fileName: file,
              title: chapterData.title || file.replace('.json', '').replace(/^\d+_/, '').replace(/_/g, ' ')
            };
          } catch (err) {
            // If reading fails, use the filename as title
            logger.error(`Error reading chapter file ${file}:`, err);
            return {
              id: index + 1,
              fileName: file,
              title: file.replace('.json', '').replace(/^\d+_/, '').replace(/_/g, ' ')
            };
          }
        })
        .sort((a, b) => {
          // Sort by chapter number first
          return a.id - b.id;
        });
      
      logger.info(`Found ${chapters.length} story chapters`);
      return chapters;
    } catch (error) {
      logger.error('Error fetching story chapters:', error);
      return [];
    }
  });

  // Get story chapter content
  safelyRegisterHandler('get-story-chapter-content', async (event, fileName) => {
    try {
      logger.info(`Fetching content for story chapter: ${fileName}`);
      const storyDir = findStoryDirectory();
      
      if (!storyDir) {
        logger.error('Story directory not found');
        return null;
      }
      
      const filePath = path.join(storyDir, fileName);
      
      if (!fs.existsSync(filePath)) {
        logger.error(`Chapter file not found: ${filePath}`);
        return null;
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      const chapterData = JSON.parse(content);
      
      logger.debug(`Successfully loaded chapter content for ${fileName}`);
      return chapterData;
    } catch (error) {
      logger.error(`Error fetching content for story chapter ${fileName}:`, error);
      return null;
    }
  });

  // Settings handlers
  
  // Get settings
  safelyRegisterHandler('settings:get', async () => {
    try {
      logger.info('Settings requested via IPC');
      const settings = loadSettings();
      logger.debug('Returning settings via IPC');
      return settings;
    } catch (error) {
      logger.error('Error retrieving settings via IPC:', error);
      throw error;
    }
  });
  
  // Save settings
  safelyRegisterHandler('settings:save', async (event, settings) => {
    try {
      logger.info('Saving settings via IPC');
      
      // Log what we're saving (with redacted API keys)
      if (settings && settings.apiKeys) {
        const apiKeyStatus = {};
        Object.keys(settings.apiKeys).forEach(service => {
          const key = settings.apiKeys[service];
          apiKeyStatus[service] = key ? `Set (${key.length > 8 ? key.substring(0, 4) + '...' + key.slice(-4) : '***'})` : 'Not set';
        });
        logger.debug('Settings being saved with API keys:', apiKeyStatus);
      }
      
      const result = saveSettings(settings);
      logger.info('Settings saved via IPC, result:', result);
      return result;
    } catch (error) {
      logger.error('Error saving settings via IPC:', error);
      throw error;
    }
  });
  
  // Clear settings
  safelyRegisterHandler('settings:clear', async () => {
    try {
      logger.info('Clearing settings');
      
      // Delete settings file if it exists
      const settingsPath = getSettingsPath();
      if (fs.existsSync(settingsPath)) {
        fs.unlinkSync(settingsPath);
      }
      
      // Return default settings
      return loadSettings();
    } catch (error) {
      logger.error('Error clearing settings:', error);
      throw error;
    }
  });
  
  // Test API key
  safelyRegisterHandler('settings:testApiKey', async (event, params) => {
    try {
      logger.info(`Testing ${params.provider} API key`);
      const result = await testApiKey(params.provider, params.apiKey);
      return result;
    } catch (error) {
      logger.error(`Error testing ${params.provider} API key:`, error);
      throw error;
    }
  });

  // Save page content to knowledge base
  safelyRegisterHandler('save-page-to-knowledge-base', async (event, pageData) => {
    try {
      return await savePageToKnowledgeBase(event, pageData);
    } catch (error) {
      logger.error('Error saving page to knowledge base:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
        message: 'Failed to save page to knowledge base'
      };
    }
  });

  // Server-side fetch to bypass CSP
  safelyRegisterHandler('server-fetch', async (event, { url, options = {} }) => {
    try {
      logger.info(`Server-side fetch requested for URL: ${url}`);
      
      if (!url) {
        return { error: 'No URL provided' };
      }
      
                try {
            const result = await serverFetch(url, options);
            
            // ULTRA-MINIMAL response - only primitive strings, nothing complex
            // This is the most aggressive serialization-safe approach possible
            return {
              success: "true", // Use string "true" instead of boolean true
              data: typeof result.data === 'string' ? 
                String(result.data || '').substring(0, 100000) : // Limit to 100KB max
                'Data could not be serialized',
              url: String(url || ''),
              timestamp: String(new Date().toISOString())
            };
      } catch (fetchError) {
        logger.error(`Server fetch internal error: ${fetchError.message}`);
                  return { 
            success: "false", // String instead of boolean
            error: String(fetchError.message || 'Unknown error'),
            url: String(url || '')
          };
      }
    } catch (error) {
      logger.error(`Server-side fetch error for ${url}:`, error);
      return { 
        success: "false", // String instead of boolean
        error: String(error.message || 'Unknown error'),
        url: String(url || '')
      };
    }
  });
  
  // Check if a channel is already registered 
  safelyRegisterHandler('check-channel-availability', async (event, channelName) => {
    try {
      // There's no direct way to check if a channel is registered in Electron,
      // so we'll use an indirect approach by checking our registered handlers
      const isAvailable = ipcMain._invokeHandlers && ipcMain._invokeHandlers.has(channelName);
      logger.debug(`Channel availability check for ${channelName}: ${!isAvailable}`);
      return !isAvailable;
    } catch (error) {
      logger.error(`Channel availability check error for ${channelName}:`, error);
      return false;
    }
  });
  
  // Register extract-content handler if not already registered
  safelyRegisterHandler('register-extract-content', async () => {
    try {
      if (!ipcMain._invokeHandlers || !ipcMain._invokeHandlers.has('extract-content')) {
        safelyRegisterHandler('extract-content', async (event, { url, options = {} }) => {
          try {
            logger.info(`Content extraction requested for URL: ${url}`);
            
            if (!url) {
              return { error: 'No URL provided' };
            }
            
            // Use server-side fetch to get the HTML content
            const fetchResult = await serverFetch(url, options);
            
            // If the content type is HTML, extract useful information
            if (fetchResult.contentType && fetchResult.contentType.includes('text/html')) {
              // Extract basic information in a serializable format
              const title = extractTitleFromHtml(fetchResult.data) || url;
              const text = extractTextFromHtml(fetchResult.data) || '';
              
              // Truncate HTML to avoid serialization issues with large pages
              const maxHtmlSize = 500 * 1024; // 500KB limit for HTML (reduced from 1MB)
              const truncatedHtml = fetchResult.data.length > maxHtmlSize ? 
                fetchResult.data.substring(0, maxHtmlSize) + '<!-- truncated due to size -->' : 
                fetchResult.data;
              
              // Truncate text for safer serialization
              const maxTextSize = 300 * 1024; // 300KB limit for text (reduced from 500KB)
              const truncatedText = text.length > maxTextSize ? 
                text.substring(0, maxTextSize) + '... [truncated due to size]' : 
                text;
              
              // ULTRA-MINIMAL response - just primitive strings, nothing more
              // This is the most aggressive serialization-safe approach possible
              return {
                success: "true", // Use string "true" instead of boolean true
                title: String(title || '').substring(0, 200), // Ultra short title
                text: String(truncatedText || '').substring(0, 5000), // Extremely truncated text
                url: String(url || ''),
                timestamp: String(new Date().toISOString())
              };
            }
            
            // For non-HTML content, return basic information
            // Ensure data is limited in size
            const maxDataSize = 300 * 1024; // 300KB limit (reduced from 500KB)
            let safeData = typeof fetchResult.data === 'string' ? fetchResult.data : String(fetchResult.data || '');
            
            // Truncate if needed
            if (safeData.length > maxDataSize) {
              safeData = safeData.substring(0, maxDataSize) + '... [truncated due to size]';
            }
            
            // ULTRA-MINIMAL response for non-HTML - only primitive strings
            return {
              success: "true", // Use string "true" instead of boolean true
              title: String(url).substring(0, 200), // Ultra short title
              text: String(safeData || '').substring(0, 5000), // Extremely truncated
              url: String(url || ''),
              timestamp: String(new Date().toISOString())
            };
          } catch (error) {
            logger.error(`Content extraction error for ${url}:`, error);
            return { error: error.message };
          }
        });
        
        logger.info('Registered extract-content handler');
        return { success: true };
      }
      
      logger.info('extract-content handler already registered');
      return { success: true, alreadyRegistered: true };
    } catch (error) {
      logger.error('Error registering extract-content handler:', error);
      return { error: error.message };
    }
  });

  logger.info('IPC handlers initialized');
}

/**
 * Save page content to knowledge base
 * @param {Object} event - IPC event
 * @param {Object} pageData - Page data object with URL, title, content, etc.
 * @returns {Promise<Object>} Success or error result
 */
async function savePageToKnowledgeBase(event, pageData) {
  try {
    console.log('[IPC] Saving page to knowledge base:', pageData.url);
    
    if (!pageData || !pageData.url || !pageData.title) {
      throw new Error('Missing required page data');
    }
    
    // Get services
    const { DatabaseService } = require('./services/database');
    const { LlmService } = require('./services/llm');
    
    // Initialize services
    const db = new DatabaseService();
    const llm = new LlmService();
    
    // Generate embeddings for page content
    let embeddings = null;
    
    if (pageData.text) {
      try {
        // Truncate text if too long (embedding models typically have token limits)
        const truncatedText = pageData.text.substring(0, 8000);
        
        // Generate embeddings
        const embeddingResult = await llm.generateEmbeddings(truncatedText);
        if (embeddingResult && embeddingResult.embedding) {
          embeddings = embeddingResult.embedding;
        }
      } catch (error) {
        console.error('[IPC] Error generating embeddings:', error);
        // Continue without embeddings if generation fails
      }
    }
    
    // Format page data for storage
    const documentData = {
      id: `page-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      url: pageData.url,
      title: pageData.title,
      content: pageData.content,
      text: pageData.text,
      headings: pageData.headings || [],
      analysis: pageData.analysis || null,
      savedAt: pageData.savedAt || new Date().toISOString(),
      embeddings: embeddings,
      type: 'web_page',
      source: 'browser_research'
    };
    
    // Save to database
    await db.saveDocument(documentData);
    
    console.log('[IPC] Page saved to knowledge base:', documentData.id);
    
    return {
      success: true,
      documentId: documentData.id,
      message: 'Page saved to knowledge base'
    };
  } catch (error) {
    console.error('[IPC] Error saving page to knowledge base:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
      message: 'Failed to save page to knowledge base'
    };
  }
}

/**
 * Extract title from HTML content
 * @param {string} html - HTML content
 * @returns {string} Extracted title or empty string
 */
function extractTitleFromHtml(html) {
  try {
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    return titleMatch ? titleMatch[1].trim() : '';
  } catch (error) {
    logger.error('Error extracting title from HTML:', error);
    return '';
  }
}

/**
 * Extract text from HTML content
 * @param {string} html - HTML content
 * @returns {string} Extracted text or empty string
 */
function extractTextFromHtml(html) {
  try {
    // Very basic text extraction - remove all HTML tags
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')    // Remove styles
      .replace(/<[^>]*>/g, ' ')                                           // Remove HTML tags
      .replace(/\s+/g, ' ')                                              // Normalize whitespace
      .trim();
  } catch (error) {
    logger.error('Error extracting text from HTML:', error);
    return '';
  }
}

module.exports = {
  initializeIpcHandlers,
  getSettingsPath,     // Export for testing
  loadSettings,        // Export for testing
  saveSettings,        // Export for testing
  savePageToKnowledgeBase,
  serverFetch          // Export for testing
}; 