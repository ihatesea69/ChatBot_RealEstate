import React, { useState, useEffect } from "react";
import {
  Table,
  Typography,
  Button,
  Input,
  Space,
  Modal,
  Form,
  notification,
  Spin,
} from "antd";
import {
  SearchOutlined,
  UserAddOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import axios from "axios";

const { Title } = Typography;

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form] = Form.useForm();

  // Lấy danh sách khách hàng
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const response = await axios.get("/api/customers");

      if (response.data.success) {
        setCustomers(response.data.data);
      } else {
        notification.error({
          message: "Lỗi",
          description:
            response.data.message || "Không thể lấy danh sách khách hàng",
        });
      }
    } catch (error) {
      console.error("Lỗi lấy danh sách khách hàng:", error);
      notification.error({
        message: "Lỗi",
        description: "Đã xảy ra lỗi khi lấy danh sách khách hàng",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Mở modal tạo/chỉnh sửa khách hàng
  const showModal = (customer = null) => {
    setEditingCustomer(customer);

    if (customer) {
      form.setFieldsValue({
        name: customer.name || "",
        phoneNumber: customer.phoneNumber,
        email: customer.email || "",
        address: customer.address || "",
        notes: customer.notes || "",
      });
    } else {
      form.resetFields();
    }

    setIsModalVisible(true);
  };

  // Đóng modal
  const handleCancel = () => {
    setIsModalVisible(false);
    setEditingCustomer(null);
  };

  // Lưu khách hàng
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingCustomer) {
        // Cập nhật khách hàng
        const response = await axios.put(
          `/api/customers/${editingCustomer.phoneNumber}`,
          values
        );

        if (response.data.success) {
          notification.success({
            message: "Thành công",
            description: "Cập nhật khách hàng thành công",
          });

          // Cập nhật danh sách
          fetchCustomers();
        }
      } else {
        // Tạo mới khách hàng
        const response = await axios.post("/api/customers", values);

        if (response.data.success) {
          notification.success({
            message: "Thành công",
            description: "Thêm khách hàng mới thành công",
          });

          // Cập nhật danh sách
          fetchCustomers();
        }
      }

      setIsModalVisible(false);
      setEditingCustomer(null);
    } catch (error) {
      console.error("Lỗi lưu khách hàng:", error);
      notification.error({
        message: "Lỗi",
        description:
          error.response?.data?.message || "Đã xảy ra lỗi khi lưu khách hàng",
      });
    }
  };

  // Lọc danh sách theo từ khóa tìm kiếm
  const filteredCustomers = customers.filter((customer) => {
    const searchKeyword = searchText.toLowerCase();

    return (
      (customer.name && customer.name.toLowerCase().includes(searchKeyword)) ||
      (customer.phoneNumber &&
        customer.phoneNumber.toLowerCase().includes(searchKeyword)) ||
      (customer.email && customer.email.toLowerCase().includes(searchKeyword))
    );
  });

  // Định nghĩa các cột của bảng
  const columns = [
    {
      title: "Tên",
      dataIndex: "name",
      key: "name",
      render: (text, record) => text || <em>Chưa có tên</em>,
    },
    {
      title: "Số điện thoại",
      dataIndex: "phoneNumber",
      key: "phoneNumber",
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (text) => text || <em>Chưa có email</em>,
    },
    {
      title: "Ngày tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date) => new Date(date).toLocaleDateString("vi-VN"),
    },
    {
      title: "Thao tác",
      key: "action",
      render: (_, record) => (
        <Space size="middle">
          <Link to={`/customers/${record.phoneNumber}`}>
            <Button icon={<EyeOutlined />} size="small" />
          </Link>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => showModal(record)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div className="customers-page">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Title level={2}>Danh sách khách hàng</Title>
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={() => showModal()}
        >
          Thêm khách hàng
        </Button>
      </div>

      <Input
        placeholder="Tìm kiếm khách hàng..."
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: 16, width: 300 }}
      />

      {loading ? (
        <div style={{ textAlign: "center", margin: "50px 0" }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={filteredCustomers}
          rowKey="phoneNumber"
          pagination={{ pageSize: 10 }}
        />
      )}

      <Modal
        title={editingCustomer ? "Chỉnh sửa khách hàng" : "Thêm khách hàng mới"}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
        okText={editingCustomer ? "Cập nhật" : "Thêm mới"}
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" initialValues={{ remember: true }}>
          <Form.Item
            name="name"
            label="Tên khách hàng"
            rules={[
              { required: true, message: "Vui lòng nhập tên khách hàng!" },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="phoneNumber"
            label="Số điện thoại"
            rules={[
              { required: true, message: "Vui lòng nhập số điện thoại!" },
            ]}
            disabled={editingCustomer}
          >
            <Input disabled={!!editingCustomer} />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[{ type: "email", message: "Email không hợp lệ!" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="address" label="Địa chỉ">
            <Input />
          </Form.Item>

          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Customers;
