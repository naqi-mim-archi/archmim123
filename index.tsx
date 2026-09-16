import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AccountProvider } from './components/account/AccountProvider';
import { installApiAuthInterceptor } from './services/firebase/apiAuthInterceptor';

installApiAuthInterceptor();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AccountProvider>
      <App />
    </AccountProvider>
  </React.StrictMode>
);
