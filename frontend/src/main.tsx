import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context';
import PublicApp from './PublicApp';
import { Loading } from './components/UI';
import './styles/main.css';
const AdminApp = lazy(() => import('./admin/AdminApp'));

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><AppProvider><Suspense fallback={<Loading />}><Routes><Route path="/admin/*" element={<AdminApp />} /><Route path="*" element={<PublicApp />} /></Routes></Suspense></AppProvider></BrowserRouter></StrictMode>);
