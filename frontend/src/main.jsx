import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import 'bootstrap-icons/font/bootstrap-icons.css'
import { AuthProvider } from './contexts/authContext.jsx'
import RealtimeConnection from './components/RealtimeConnection'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
    <RealtimeConnection />

    <App />
    </AuthProvider>
  </StrictMode>,
)
