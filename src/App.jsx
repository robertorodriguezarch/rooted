import { Component, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Explore from './pages/Explore.jsx';
import EventDetail from './pages/EventDetail.jsx';
import Upcoming, { NotFound } from './pages/Upcoming.jsx';
const Auth = lazy(() => import('./pages/Auth.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const CreateEvent = lazy(() => import('./pages/CreateEvent.jsx'));

class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="not-found page-container"><h1>Let’s try a fresh start.</h1><p>Something went wrong while loading this page.</p><button className="button button-primary" onClick={() => window.location.reload()}>Reload Rooted</button></div>;
    return this.props.children;
  }
}

export default function App() {
  return <ErrorBoundary><Routes><Route element={<Layout />}><Route index element={<Home />} /><Route path="explore" element={<Explore />} /><Route path="events/:id" element={<EventDetail />} /><Route path="create" element={<CreateEvent />} /><Route path="profile" element={<Profile />} />{[['login', 'login'], ['signup', 'signup'], ['forgot-password', 'forgot'], ['reset-password', 'reset'], ['auth/callback', 'callback']].map(([path, mode]) => <Route key={path} path={path} element={<Auth mode={mode} />} />)}{['community', 'grow-neighbor'].map(page => <Route key={page} path={page} element={<Upcoming page={page} />} />)}<Route path="*" element={<NotFound />} /></Route></Routes></ErrorBoundary>;
}
