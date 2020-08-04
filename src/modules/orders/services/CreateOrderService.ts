import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists) {
      throw new AppError('Cannot create order with invalid customer');
    }

    const findExistentProducts = await this.productsRepository.findAllById(
      products,
    );

    if (findExistentProducts.length < products.length) {
      throw new AppError('One or more products are not valid');
    }

    const productsWithoutStock = findExistentProducts.filter(product => {
      const quantityMustHave = products.filter(
        findProduct => findProduct.id === product.id,
      );

      return product.quantity < quantityMustHave[0].quantity;
    });

    if (productsWithoutStock.length) {
      throw new AppError('One or more products are out of stock');
    }

    const formattedProducts = findExistentProducts.map(product => {
      const quantityToBuy = products.filter(
        findProduct => findProduct.id === product.id,
      );

      return {
        product_id: product.id,
        price: product.price,
        quantity: quantityToBuy[0].quantity,
      };
    });

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: formattedProducts,
    });

    const orderedProductsQuantity = findExistentProducts.map(product => {
      // Use the products param passed to get the amount to subtract
      const quantityToSubtract = products.filter(
        findProduct => findProduct.id === product.id,
      );

      return {
        id: product.id,
        quantity: product.quantity - quantityToSubtract[0].quantity,
      };
    });

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
