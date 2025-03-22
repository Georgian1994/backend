// backend/server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Environment variables
const PORT = process.env.PORT || 3001;
const AZURE_KEY = process.env.AZURE_TRANSLATOR_KEY || 'your_azure_key_here';
const AZURE_REGION = process.env.AZURE_REGION || 'global';
const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';

// Standard language code mapping (if needed)
const sourceLanguageMap = {
  'auto': '',  // Azure handles auto-detection differently
  'EN-US': 'en',
  'EN-GB': 'en',
  'PT-BR': 'pt',
  'PT-PT': 'pt',
  'ZH': 'zh-Hans' // Simplified Chinese
};

// Helper function to get the correct language code
const getLanguageCode = (code) => {
  if (!code) return '';
  if (code === 'auto') return '';
  
  // Convert to lowercase first (Azure uses lowercase codes)
  const lowercaseCode = code.toLowerCase();
  
  // Check if we need to map this code
  return sourceLanguageMap[code] || lowercaseCode;
};

// Root route handler for Railway deployment
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Translation API is running', 
    endpoints: [
      { method: 'GET', path: '/api/health', description: 'Health check endpoint' },
      { method: 'GET', path: '/api/languages', description: 'Get all supported languages' },
      { method: 'GET', path: '/api/source-languages', description: 'Get source languages including auto-detect' },
      { method: 'GET', path: '/api/target-languages', description: 'Get target languages' },
      { method: 'POST', path: '/api/translate', description: 'Translate text between languages' }
    ]
  });
});

// Endpoint for text translation
app.post('/api/translate', async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const sourceLanguage = getLanguageCode(sourceLang);
    const targetLanguage = getLanguageCode(targetLang);
    
    console.log(`Translating text from ${sourceLang} (${sourceLanguage}) to ${targetLang} (${targetLanguage}):`, 
      text.substring(0, 30) + (text.length > 30 ? '...' : ''));
    
    // Prepare request to Azure Translator API
    const params = new URLSearchParams({
      'api-version': '3.0',
      'to': targetLanguage
    });
    
    // Only add 'from' parameter if not auto-detecting
    if (sourceLanguage && sourceLang !== 'auto') {
      params.append('from', sourceLanguage);
    }
    
    const requestUrl = `${AZURE_ENDPOINT}/translate?${params.toString()}`;
    
    const response = await axios({
      method: 'post',
      url: requestUrl,
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Ocp-Apim-Subscription-Region': AZURE_REGION,
        'Content-Type': 'application/json'
      },
      data: [{
        text: text
      }]
    });
    
    console.log('Azure Translator API Response:', JSON.stringify(response.data, null, 2));
    
    if (!response.data || response.data.length === 0 || !response.data[0].translations || response.data[0].translations.length === 0) {
      throw new Error('No translation received from Azure Translator API');
    }
    
    // Extract the detected language if available
    let detectedLanguage = '';
    if (response.data[0].detectedLanguage) {
      detectedLanguage = response.data[0].detectedLanguage.language;
    }
    
    res.json({
      translation: response.data[0].translations[0].text,
      detectedLanguage: detectedLanguage,
      changed: text.toLowerCase().trim() !== response.data[0].translations[0].text.toLowerCase().trim()
    });
  } catch (error) {
    console.error('Translation error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Translation failed', 
      details: error.response?.data || error.message 
    });
  }
});

// Endpoint to get supported languages
app.get('/api/languages', async (req, res) => {
  try {
    console.log('Fetching supported languages from Azure');
    
    const response = await axios({
      method: 'get',
      url: `${AZURE_ENDPOINT}/languages?api-version=3.0&scope=translation`,
      headers: {
        'Accept-Language': 'en'
      }
    });
    
    if (!response.data || !response.data.translation) {
      throw new Error('Invalid response from Azure Languages API');
    }
    
    // Transform Azure's language format to our app's format
    const languages = Object.entries(response.data.translation).map(([code, langData]) => ({
      language: code,
      name: langData.name
    }));
    
    console.log(`Retrieved ${languages.length} languages`);
    
    res.json(languages);
  } catch (error) {
    console.error('Error fetching languages:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch languages', 
      details: error.response?.data || error.message 
    });
  }
});

// Endpoint to get available source languages (including auto-detect)
app.get('/api/source-languages', async (req, res) => {
  try {
    console.log('Fetching source languages from Azure');
    
    const response = await axios({
      method: 'get',
      url: `${AZURE_ENDPOINT}/languages?api-version=3.0&scope=translation`,
      headers: {
        'Accept-Language': 'en'
      }
    });
    
    if (!response.data || !response.data.translation) {
      throw new Error('Invalid response from Azure Languages API');
    }
    
    // Transform Azure's language format to our app's format
    const languages = Object.entries(response.data.translation).map(([code, langData]) => ({
      language: code,
      name: langData.name
    }));
    
    // Add auto-detect option
    languages.unshift({
      language: 'auto',
      name: 'Detect language'
    });
    
    console.log(`Retrieved ${languages.length - 1} source languages (plus auto-detect)`);
    
    res.json(languages);
  } catch (error) {
    console.error('Error fetching source languages:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch source languages', 
      details: error.response?.data || error.message 
    });
  }
});

// Endpoint to get target languages
app.get('/api/target-languages', async (req, res) => {
  try {
    console.log('Fetching target languages from Azure');
    
    const response = await axios({
      method: 'get',
      url: `${AZURE_ENDPOINT}/languages?api-version=3.0&scope=translation`,
      headers: {
        'Accept-Language': 'en'
      }
    });
    
    if (!response.data || !response.data.translation) {
      throw new Error('Invalid response from Azure Languages API');
    }
    
    // Transform Azure's language format to our app's format
    const languages = Object.entries(response.data.translation).map(([code, langData]) => ({
      language: code,
      name: langData.name
    }));
    
    console.log(`Retrieved ${languages.length} target languages`);
    
    res.json(languages);
  } catch (error) {
    console.error('Error fetching target languages:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch target languages', 
      details: error.response?.data || error.message 
    });
  }
});

// Simple health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Translation API is running with Azure Translator' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/api/health`);
});