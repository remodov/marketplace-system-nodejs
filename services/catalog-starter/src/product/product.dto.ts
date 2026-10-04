import { IsDefined, IsInt, IsNumber, IsOptional, IsPositive, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsDefined({ message: 'название обязательно' })
  @IsString({ message: 'название должно быть строкой' })
  @MinLength(1, { message: 'название обязательно' })
  title!: string;

  @IsDefined({ message: 'цена обязательна' })
  @IsNumber({}, { message: 'цена должна быть числом' })
  @IsPositive({ message: 'цена должна быть больше нуля' })
  price!: number;

  @IsDefined({ message: 'остаток обязателен' })
  @IsInt({ message: 'остаток должен быть целым' })
  @Min(0, { message: 'остаток не может быть отрицательным' })
  stock!: number;
}

export class ReserveDto {
  @IsDefined({ message: 'количество обязательно' })
  @IsInt({ message: 'количество должно быть целым' })
  @Min(1, { message: 'количество должно быть больше нуля' })
  quantity!: number;
}

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  query?: string;
}
