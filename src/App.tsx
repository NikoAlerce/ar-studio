import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Editor from './pages/Editor';
import Viewer from './pages/Viewer';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/editor/:id" element={<Editor />} />
        <Route path="/play/:id" element={<Viewer />} />
      </Routes>
    </Router>
  );
}

export default App;
