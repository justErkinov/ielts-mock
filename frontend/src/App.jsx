import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
              </Routes>
            </>
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
