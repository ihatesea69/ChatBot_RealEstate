import React, { useState, useEffect } from "react";
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Typography,
  Tag,
  Spin,
  Divider,
} from "antd";
import {
  TeamOutlined,
  PhoneOutlined,
  MessageOutlined,
  RiseOutlined,
} from "@ant-design/icons";
import { Pie } from "@ant-design/plots";
import axios from "axios";

const { Title } = Typography;

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalLeads: 0,
    newCustomers: 0,
    leadsByStatus: {},
  });
  const [recentLeads, setRecentLeads] = useState([]);

  useEffect(() => {
    // Lấy dữ liệu dashboard
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const statsResponse = await axios.get("/api/dashboard/stats");
        const leadsResponse = await axios.get("/api/leads");

        if (statsResponse.data.success) {
          setStats(statsResponse.data.data);
        }

        if (leadsResponse.data.success) {
          // Sắp xếp leads theo timestamp mới nhất và lấy 5 cái
          const sortedLeads = leadsResponse.data.data
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 5);

          setRecentLeads(sortedLeads);
        }
      } catch (error) {
        console.error("Lỗi khi lấy dữ liệu dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Chuẩn bị dữ liệu cho biểu đồ phân phối leads theo trạng thái
  const getPieChartData = () => {
    const data = [];

    for (const [status, count] of Object.entries(stats.leadsByStatus || {})) {
      data.push({
        type: status,
        value: count,
      });
    }

    return data;
  };

  // Cấu hình biểu đồ Pie
  const pieConfig = {
    data: getPieChartData(),
    angleField: "value",
    colorField: "type",
    radius: 0.8,
    label: {
      type: "outer",
      content: "{name} {percentage}",
    },
    interactions: [{ type: "pie-legend-active" }, { type: "element-active" }],
  };

  // Màu cho tag trạng thái lead
  const statusColors = {
    "New Lead": "blue",
    Contacted: "cyan",
    Qualified: "green",
    Negotiation: "orange",
    Won: "green",
    Lost: "red",
    "On Hold": "purple",
  };

  // Cấu hình cho bảng leads gần đây
  const columns = [
    {
      title: "Khách hàng",
      dataIndex: "name",
      key: "name",
      render: (text, record) => text || record.phoneNumber,
    },
    {
      title: "Số điện thoại",
      dataIndex: "phoneNumber",
      key: "phoneNumber",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (status) => (
        <Tag color={statusColors[status] || "default"}>{status}</Tag>
      ),
    },
    {
      title: "Ngày tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date) => new Date(date).toLocaleDateString("vi-VN"),
    },
  ];

  return (
    <div className="dashboard">
      <Title level={2}>Tổng quan</Title>

      {loading ? (
        <div style={{ textAlign: "center", margin: "50px 0" }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={16}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Tổng số khách hàng"
                  value={stats.totalCustomers}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Tổng số leads"
                  value={stats.totalLeads}
                  prefix={<PhoneOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Khách hàng mới (7 ngày)"
                  value={stats.newCustomers}
                  prefix={<RiseOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Tỉ lệ chuyển đổi"
                  value={
                    stats.totalLeads
                      ? Math.round(
                          (stats.totalCustomers / stats.totalLeads) * 100
                        )
                      : 0
                  }
                  suffix="%"
                  prefix={<MessageOutlined />}
                />
              </Card>
            </Col>
          </Row>

          <Divider />

          <Row gutter={16} style={{ marginTop: 20 }}>
            <Col span={12}>
              <Card title="Phân bố Leads theo trạng thái">
                {getPieChartData().length > 0 ? (
                  <Pie {...pieConfig} />
                ) : (
                  <div style={{ textAlign: "center", padding: "30px 0" }}>
                    Chưa có dữ liệu leads
                  </div>
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card title="Leads gần đây">
                <Table
                  dataSource={recentLeads}
                  columns={columns}
                  rowKey="timestamp"
                  pagination={false}
                  size="small"
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

export default Dashboard;
