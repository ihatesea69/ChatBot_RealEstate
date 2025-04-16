import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Button,
  Typography,
  Breadcrumb,
} from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  DashboardOutlined,
  TeamOutlined,
  MessageOutlined,
  PhoneOutlined,
} from "@ant-design/icons";

const { Header, Sider, Content, Footer } = Layout;
const { Title } = Typography;

const AppLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Xử lý khi đăng xuất
  const handleLogout = () => {
    // Xóa token trong localStorage
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    // Chuyển hướng về trang đăng nhập
    navigate("/login");
  };

  // Tạo breadcrumb dựa trên đường dẫn hiện tại
  const getBreadcrumb = () => {
    const pathSnippets = location.pathname.split("/").filter((i) => i);
    const breadcrumbItems = [];

    let url = "";

    pathSnippets.forEach((snippet, index) => {
      url += `/${snippet}`;

      let breadcrumbName = snippet.charAt(0).toUpperCase() + snippet.slice(1);

      // Định dạng tên breadcrumb
      switch (snippet) {
        case "dashboard":
          breadcrumbName = "Tổng quan";
          break;
        case "customers":
          breadcrumbName = "Khách hàng";
          break;
        case "leads":
          breadcrumbName = "Leads";
          break;
        case "conversations":
          breadcrumbName = "Hội thoại";
          break;
        case "add":
          breadcrumbName = "Thêm mới";
          break;
        case "edit":
          breadcrumbName = "Chỉnh sửa";
          break;
        default:
          if (!isNaN(snippet)) {
            breadcrumbName = "Chi tiết";
          }
      }

      breadcrumbItems.push({
        key: url,
        title:
          index === pathSnippets.length - 1 ? (
            <span>{breadcrumbName}</span>
          ) : (
            <Link to={url}>{breadcrumbName}</Link>
          ),
      });
    });

    return breadcrumbItems;
  };

  // Menu dropdown cho avatar
  const userMenu = (
    <Menu>
      <Menu.Item key="profile" icon={<UserOutlined />}>
        <Link to="/profile">Tài khoản</Link>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="logout" icon={<LogoutOutlined />} onClick={handleLogout}>
        Đăng xuất
      </Menu.Item>
    </Menu>
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        className="header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
        }}
      >
        <div
          className="logo"
          style={{ color: "white", fontSize: "20px", fontWeight: "bold" }}
        >
          <Link
            to="/dashboard"
            style={{ color: "white", textDecoration: "none" }}
          >
            CRM System
          </Link>
        </div>
        <div className="header-right">
          <Dropdown overlay={userMenu} placement="bottomRight" arrow>
            <Avatar
              icon={<UserOutlined />}
              style={{ cursor: "pointer", backgroundColor: "#1890ff" }}
            />
          </Dropdown>
        </div>
      </Header>

      <Layout>
        <Sider
          width={200}
          style={{
            background: "#fff",
            overflow: "auto",
            height: "100%",
            position: "fixed",
            left: 0,
            top: 64,
            bottom: 0,
          }}
        >
          <Menu
            mode="inline"
            defaultSelectedKeys={[location.pathname]}
            selectedKeys={[location.pathname]}
            style={{ height: "100%", borderRight: 0 }}
            onClick={({ key }) => navigate(key)}
          >
            <Menu.Item key="/dashboard" icon={<DashboardOutlined />}>
              Tổng quan
            </Menu.Item>
            <Menu.Item key="/customers" icon={<TeamOutlined />}>
              Khách hàng
            </Menu.Item>
            <Menu.Item key="/leads" icon={<PhoneOutlined />}>
              Leads
            </Menu.Item>
            <Menu.Item key="/conversations" icon={<MessageOutlined />}>
              Hội thoại
            </Menu.Item>
          </Menu>
        </Sider>

        <Layout style={{ padding: "0 24px 24px", marginLeft: 200 }}>
          <Breadcrumb style={{ margin: "16px 0" }}>
            <Breadcrumb.Item key="home">
              <Link to="/dashboard">Trang chủ</Link>
            </Breadcrumb.Item>
            {getBreadcrumb().map((item) => (
              <Breadcrumb.Item key={item.key}>{item.title}</Breadcrumb.Item>
            ))}
          </Breadcrumb>

          <Content
            style={{
              background: "#fff",
              padding: 24,
              margin: 0,
              minHeight: 280,
              borderRadius: 4,
            }}
          >
            {children}
          </Content>

          <Footer style={{ textAlign: "center" }}>
            CRM System ©{new Date().getFullYear()} - Phát triển bởi Công ty của
            bạn
          </Footer>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
