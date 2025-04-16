import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Layout } from "antd";
import LoginForm from "../components/LoginForm";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Nếu đã đăng nhập, chuyển hướng đến trang dashboard hoặc trang trước đó
    const token = localStorage.getItem("token");
    if (token) {
      const from = location.state?.from?.pathname || "/dashboard";
      navigate(from, { replace: true });
    }
  }, [navigate, location]);

  return (
    <Layout style={{ minHeight: "100vh", background: "#f0f2f5" }}>
      <LoginForm />
    </Layout>
  );
};

export default Login;
