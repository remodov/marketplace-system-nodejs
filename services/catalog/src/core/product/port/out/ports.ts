import { Product, Status } from '../../aggregate/product';

export const SORT_FIELDS = ['createdAt,desc', 'createdAt,asc', 'price,asc', 'price,desc', 'title,asc'] as const;

export type SortField = (typeof SORT_FIELDS)[number];

export type ListFilter = {
  status?: Status;
  page: number;
  size: number;
  sort: SortField;
};

export type ProductPage = {
  items: Product[];
  page: number;
  size: number;
  total: number;
};

export interface ProductRepository {
  byId(id: string): Promise<Product>;
  byIdForUpdate(id: string): Promise<Product>;
  insert(product: Product): Promise<void>;
  update(product: Product): Promise<void>;
  listBySeller(sellerId: string, filter: ListFilter): Promise<ProductPage>;
  listPublished(filter: ListFilter): Promise<ProductPage>;
}

export const ACTION_PRODUCT_PUBLISHED = 'PRODUCT_PUBLISHED';
export const ACTION_PRODUCT_HIDDEN = 'PRODUCT_HIDDEN';
export const ACTION_PRODUCT_PRICE_CHANGED = 'PRODUCT_PRICE_CHANGED';

export type AuditEntry = {
  id: string;
  actorId: string;
  action: string;
  productId: string;
  occurredAt: Date;
  metadata: Record<string, string>;
};

export interface AuditLogger {
  record(entry: AuditEntry): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}

export type TransactionalPorts = {
  products: ProductRepository;
  audit: AuditLogger;
};

export interface UnitOfWork {
  within<T>(work: (tx: TransactionalPorts) => Promise<T>): Promise<T>;
}

export type PresignedUpload = {
  key: string;
  url: string;
  expiresAt: Date;
};

export interface ImageStorage {
  presignUpload(key: string, contentType: string): Promise<PresignedUpload>;
}
