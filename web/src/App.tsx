import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Catalog } from './pages/Catalog';
import { BookDetail } from './pages/BookDetail';
import { MyLibrary } from './pages/MyLibrary';
import { Circulation } from './pages/Circulation';
import { Members } from './pages/Members';
import { ManageBooks } from './pages/ManageBooks';
import { Reports } from './pages/Reports';
import { Notifications } from './pages/Notifications';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Catalog />} />
          <Route path="books/:bookId" element={<BookDetail />} />
          <Route path="notifications" element={<Notifications />} />

          <Route element={<ProtectedRoute roles={['MEMBER']} />}>
            <Route path="my" element={<MyLibrary />} />
          </Route>

          <Route element={<ProtectedRoute roles={['ADMIN', 'LIBRARIAN']} />}>
            <Route path="circulation" element={<Circulation />} />
            <Route path="members" element={<Members />} />
            <Route path="manage/books" element={<ManageBooks />} />
            <Route path="reports" element={<Reports />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
