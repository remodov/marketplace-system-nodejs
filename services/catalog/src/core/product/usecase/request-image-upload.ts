import { Principal } from '../../security/principal';
import { IdGenerator, ImageStorage, PresignedUpload, ProductRepository } from '../port/out/ports';

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
    // TODO шаг 12: ссылку на загрузку получает только владелец товара (или администратор).
    // Карточку смотреть может кто угодно, а грузить в неё файлы - нет.
    // Чужой товар для не-владельца должен выглядеть как несуществующий.
    const key = `products/${product.state().id}/${this.ids.newId()}`;
    return this.images.presignUpload(key, cmd.contentType);
  }
}
