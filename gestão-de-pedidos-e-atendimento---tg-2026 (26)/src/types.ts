export type UserRole = 'manager' | 'kitchen' | 'garcom' | 'admin' | 'owner';

export interface User {
  email: string;
  name?: string;
  password?: string;
  restaurantId?: string;
  isVerified?: boolean;
  role?: UserRole;
  phone?: string;
  createdAt?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  prepTimeMinutes?: number;
  available?: boolean;
}

export interface RestaurantConfig {
  id: string;
  ownerEmail: string;
  name: string;
  tagline: string;
  description: string;
  primaryColor: string;
  cuisine: string;
  logoUrl: string;
  heroImageUrl: string;
  phone?: string;
  address?: string;
  menu: MenuItem[];
  categories?: string[];
  createdAt?: number;
  autoAcceptOrders?: boolean;
}

export interface OrderItem {
  itemId: string;
  name: string;
  quantity: number;
  price: number;
  observation?: string;
}

export type OrderStatus = 
  | 'Recebido' 
  | 'Em Preparação' 
  | 'Pronto' 
  | 'Entregue' 
  | 'Cancelado';

export interface OrderStatusEvent {
  status: OrderStatus;
  timestamp: number;
  note?: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  restaurantName?: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  timestamp: number;
  customerName: string;
  tableId?: string;
  tableNumber?: string;
  notes?: string;
  prepTimeMinutes?: number;
  statusHistory?: OrderStatusEvent[];
  acceptedAt?: number;
  acceptedBy?: string;
  closedAt?: number;
  closedBy?: string;
}

export type TableStatus = 'livre' | 'ocupada';

export interface RestaurantTable {
  id: string;
  restaurantId: string;
  number: number | string;
  name?: string;
  capacity?: number;
  status: TableStatus;
  currentOrderId?: string;
  location?: string;
  updatedAt?: number;
}

export type ViewMode = 
  | 'login' 
  | 'kitchen_kds' 
  | 'waiter_orders'
  | 'admin';
