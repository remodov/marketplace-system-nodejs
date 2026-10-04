import { Principal } from '../../security/principal';
import { IdGenerator, ImageStorage, PresignedUpload, ProductRepository } from '../port/out/ports';
import { requireOwnership } from './ownership';

export type RequestImageUpload = {
  productId: string;
  requester: Principal;
  contentType: string;
};

export class RequestImageUploadHandler {
  constructor(
    private readonly products: ProductRepository,
    private readonly images: ImageStorage,
    private readonly ids: IdGenerator,
  ) {}

  async handle(cmd: RequestImageUpload): Promise<PresignedUpload> {
    const product = await this.products.byId(cmd.productId);
    requireOwnership(product, cmd.requester);
    const key = `products/${product.state().id}/${this.ids.newId()}`;
    return this.images.presignUpload(key, cmd.contentType);
  }
}
