import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import ListeningList from './modules/listening/ListeningList';
import ListeningTest from './modules/listening/ListeningTest';
import ReadingList from './modules/reading/ReadingList';
import ReadingTest from './modules/reading/ReadingTest';
import WritingList from './modules/writing/WritingList';
import WritingTest from './modules/writing/WritingTest';
import StudioHome from './modules/studio/StudioHome';
import StudioEditor from './modules/studio/StudioEditor';

function NotFound() {
  return (
    <div className="container" style={{ textAlign: 'center', padding: '80px 20px' }}>
      <h2 style={{ fontSize: 22, marginBottom: 8 }}>Page not found</h2>
      <p className="text-muted" style={{ marginBottom: 20 }}>This address does not exist. Check the link or go back to the tests.</p>
      <Link to="/" className="btn btn-primary">Go to the home page</Link>
    </div>
  );
}

function TeacherRoute({ children }) {
  const { user } = useAuth();
  return user && (user.is_teacher || user.is_superuser) ? children : <Navigate to="/" />;
}

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/*" element={
          <PrivateRoute>
            <>
              <Navbar />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/listening" element={<ListeningList />} />
                <Route path="/listening/:id" element={<ListeningTest />} />
                <Route path="/reading" element={<ReadingList />} />
                <Route path="/reading/:id" element={<ReadingTest />} />
                <Route path="/writing" element={<WritingList />} />
                <Route path="/writing/:id" element={<WritingTest />} />
                <Route path="/studio" element={<TeacherRoute><StudioHome /></TeacherRoute>} />
                <Route path="/studio/:kind/:id" element={<TeacherRoute><StudioEditor /></TeacherRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </>
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
