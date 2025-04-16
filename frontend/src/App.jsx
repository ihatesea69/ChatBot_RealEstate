import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import axios from "axios";

// Pages
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Leads from "./pages/Leads";
import Conversations from "./pages/Conversations";
import NotFound from "./pages/NotFound";

// Components
import Layout from "./components/Layout";
import PrivateRoute from "./components/PrivateRoute";

// Styles
import "./App.css";
import "antd/dist/antd.css";

const App = () => {
  useEffect(() => {
    // Cấu hình axios để gửi token với mỗi request
    const token = localStorage.getItem("token");
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    }

    // Cấu hình axios cho base URL
    axios.defaults.baseURL =
      process.env.REACT_APP_API_URL || "http://localhost:5000";

    // Xử lý lỗi toàn cục cho axios
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // Xử lý lỗi xác thực (401 Unauthorized)
        if (error.response && error.response.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/customers"
          element={
            <PrivateRoute>
              <Layout>
                <Customers />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/customers/:phoneNumber"
          element={
            <PrivateRoute>
              <Layout>
                <CustomerDetail />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/leads"
          element={
            <PrivateRoute>
              <Layout>
                <Leads />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route
          path="/conversations"
          element={
            <PrivateRoute>
              <Layout>
                <Conversations />
              </Layout>
            </PrivateRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
};

export default App;
