import React from "react";
import { Navigate, useLocation } from "react-router-dom";

const PrivateRoute = ({ children }) => {
  const location = useLocation();
  const token = localStorage.getItem("token");

  // Nếu không có token, chuyển hướng về trang đăng nhập và lưu url hiện tại để chuyển hướng lại sau khi đăng nhập
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Nếu có token, cho phép truy cập
  return children;
};

export default PrivateRoute;
