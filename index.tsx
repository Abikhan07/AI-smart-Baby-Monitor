
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// The API key is assumed to be pre-configured in the environment variable process.env.API_KEY.
// We remove the manual polyfill to avoid TypeScript errors and comply with coding standards.

console.log("Lullaby AI station starting...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Critical failure during React mount:", error);
}
