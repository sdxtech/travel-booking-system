import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import UserHome from './pages/UserHome'
import DriverHome from './pages/DriverHome'
import OfficeHome from './pages/OfficeHome'
import TicketRequest from './pages/TicketRequest'
import TicketHistory from './pages/TicketHistory'
import BookingDriver from './pages/BookingDriver'
import BookingHistory from './pages/BookingHistory'
import OfficeTicketHistory from './pages/OfficeTicketHistory'
import OfficeDriverHistory from './pages/OfficeDriverHistory'
import OfficeTravelAccommodation from './pages/OfficeTravelAccommodation'
import OfficeAssignDrivers from './pages/OfficeAssignDrivers'
import OfficeManageUser from './pages/OfficeManageUser'
import AdminManageUser from './pages/AdminManageUser'
import AdminHome from './pages/AdminHome'
import AdminSettings from './pages/AdminSettings'
import AdminDriverAvailability from './pages/AdminDriverAvailability'
import ProtectedRoute from './components/ProtectedRoute'
import './App.css'

// Main router for all app pages.
function App() {
  return (
    <Router>
      <div className="app-shell">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/user/home"
            element={
              <ProtectedRoute>
                <UserHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/ticket-request"
            element={
              <ProtectedRoute>
                <TicketRequest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/ticket-history"
            element={
              <ProtectedRoute>
                <TicketHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/booking-driver"
            element={
              <ProtectedRoute>
                <BookingDriver />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/booking-history"
            element={
              <ProtectedRoute>
                <BookingHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/home"
            element={
              <ProtectedRoute>
                <DriverHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/home"
            element={
              <ProtectedRoute>
                <OfficeHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/ticket-requests"
            element={
              <ProtectedRoute>
                <Navigate to="/office/ticket-history" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/driver-requests"
            element={
              <ProtectedRoute>
                <Navigate to="/office/driver-history" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/ticket-history"
            element={
              <ProtectedRoute>
                <OfficeTicketHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/driver-history"
            element={
              <ProtectedRoute>
                <OfficeDriverHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/travel-accommodation"
            element={
              <ProtectedRoute>
                <OfficeTravelAccommodation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/assign-drivers"
            element={
              <ProtectedRoute>
                <OfficeAssignDrivers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/manage-user"
            element={
              <ProtectedRoute>
                <OfficeManageUser />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/home"
            element={
              <ProtectedRoute>
                <AdminHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/manage-user"
            element={
              <ProtectedRoute>
                <AdminManageUser />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute>
                <Navigate to="/admin/settings/cancel-booking" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings/cancel-booking"
            element={
              <ProtectedRoute>
                <AdminSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings/driver-availability"
            element={
              <ProtectedRoute>
                <AdminDriverAvailability />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
