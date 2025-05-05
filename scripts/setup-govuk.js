/**
 * GOV.UK Frontend Setup Script
 * 
 * Downloads and configures GOV.UK Frontend assets for the application.
 * This script should be run during project setup and after npm install.
 */

const fs = require('fs');
const path = require('path');

// First, let's log the contents of the govuk-frontend directory to debug
function listGovukFiles() {
  const govukPath = path.join(__dirname, '..', 'node_modules', 'govuk-frontend');
  if (fs.existsSync(govukPath)) {
    console.log('Contents of govuk-frontend directory:');
    const files = fs.readdirSync(govukPath, { recursive: true });
    console.log(files);
  } else {
    console.error('govuk-frontend directory not found!');
  }
}

const ASSETS_TO_COPY = [
  {
    source: 'node_modules/govuk-frontend/dist/govuk/govuk-frontend.min.js',
    destination: 'public/govuk-frontend/govuk.min.js'
  },
  {
    source: 'node_modules/govuk-frontend/dist/govuk/govuk-frontend.min.css',
    destination: 'public/govuk-frontend/govuk.min.css'
  },
  {
    source: 'node_modules/govuk-frontend/dist/govuk/assets/fonts',
    destination: 'public/assets/fonts',
    isDirectory: true
  },
  {
    source: 'node_modules/govuk-frontend/dist/govuk/assets/images',
    destination: 'public/assets/images',
    isDirectory: true
  }
];

function copyDirectory(source, destination) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const files = fs.readdirSync(source);
  files.forEach(file => {
    const sourcePath = path.join(source, file);
    const destPath = path.join(destination, file);
    
    if (fs.statSync(sourcePath).isDirectory()) {
      copyDirectory(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  });
}

function copyAsset(source, destination, isDirectory = false) {
  try {
    const dir = path.dirname(destination);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(source)) {
      throw new Error(`Source not found: ${source}`);
    }

    if (isDirectory) {
      copyDirectory(source, destination);
      console.log(`Successfully copied directory ${path.basename(source)}`);
    } else {
      fs.copyFileSync(source, destination);
      console.log(`Successfully copied ${path.basename(source)}`);
    }
  } catch (error) {
    console.error(`Error copying ${source}:`, error.message);
    process.exit(1);
  }
}

function setup() {
  console.log('Setting up GOV.UK Frontend...');
  listGovukFiles(); // Add this to debug
  
  for (const asset of ASSETS_TO_COPY) {
    console.log(`Copying ${asset.source}...`);
    copyAsset(asset.source, asset.destination, asset.isDirectory);
  }

  console.log('Setup complete!');
}

setup(); 