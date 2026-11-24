import { createRoot } from 'react-dom/client';
import { AppProvider } from './lib/store.jsx';
import App from './App.jsx';
import './styles.css';
import './motion.css';

createRoot(document.getElementById('root')).render(<AppProvider><App /></AppProvider>);
