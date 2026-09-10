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
import { AuthProvider } from './contexts/authContext'
import Unauthorized from './pages/Unauthorized'
import ResetPassword from './pages/ResetPassword'
import AdminPagePermissions from './pages/AdminPagePermissions'


// Main router for all app pages.
function App() {
  return (
    <Router>
      <div className="app-shell">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route
            path="/user/home"
            element={
              <ProtectedRoute allowedRoles={["user"]}>
                <UserHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/ticket-request"
            element={
              <ProtectedRoute allowedRoles={["user"]} pageId="page_ticket_request">
                <TicketRequest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/ticket-history"
            element={
              <ProtectedRoute allowedRoles={["user"]} pageId="page_ticket_history">
                <TicketHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/booking-driver"
            element={
              <ProtectedRoute allowedRoles={["user"]} pageId="page_booking_driver">
                <BookingDriver />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/booking-history"
            element={
              <ProtectedRoute allowedRoles={["user"]} pageId="page_booking_history">
                <BookingHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/home"
            element={
              <ProtectedRoute allowedRoles={["driver"]}>
                <DriverHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/home"
            element={
              <ProtectedRoute allowedRoles={["superadmin", "office_coordinator"]}>
                <OfficeHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/ticket-requests"
            element={
              <ProtectedRoute allowedRoles={["superadmin", "office_coordinator"]}>
                <Navigate to="/office/ticket-history" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/driver-requests"
            element={
              <ProtectedRoute allowedRoles={["superadmin", "office_coordinator"]}>
                <Navigate to="/office/driver-history" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/ticket-history"
            element={
              <ProtectedRoute allowedRoles={["superadmin", "office_coordinator"]}>
                <OfficeTicketHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/driver-history"
            element={
              <ProtectedRoute allowedRoles={["superadmin", "office_coordinator"]}>
                <OfficeDriverHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/travel-accommodation"
            element={
              <ProtectedRoute allowedRoles={["superadmin", "office_coordinator"]}>
                <OfficeTravelAccommodation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/assign-drivers"
            element={
              <ProtectedRoute allowedRoles={["superadmin", "office_coordinator"]}>
                <OfficeAssignDrivers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/office/manage-user"
            element={
              <ProtectedRoute allowedRoles={["superadmin", "office_coordinator"]}>
                <OfficeManageUser />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/home"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <AdminHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/manage-user"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <AdminManageUser />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <Navigate to="/admin/settings/cancel-booking" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings/cancel-booking"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <AdminSettings />
              </ProtectedRoute>
            }
          />
           <Route
            path="/admin/settings/page-permissions"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <AdminPagePermissions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings/driver-availability"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <AdminDriverAvailability />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reset-password"
            element={
              <ProtectedRoute allowedRoles={["user", "driver"]}>
                <ResetPassword />
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
