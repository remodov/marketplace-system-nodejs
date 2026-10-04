import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const src = resolve(__dirname, '../src');

const forbiddenInCore = [
  '@nestjs',
  'typeorm',
  'express',
  'pg',
  'class-validator',
  'class-transformer',
  'jose',
  'reflect-metadata',
  'opossum',
  'undici',
  'kafkajs',
  'node:http',
  'http',
  'https',
];

function tsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...tsFiles(path));
    else if (name.endsWith('.ts')) files.push(path);
  }
  if (files.length === 0 && dir === src) throw new Error(`в ${dir} не найдено ни одного файла`);
  return files;
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  for (const pattern of [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s+['"]([^'"]+)['"]/g, /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g]) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

function isTechnology(specifier: string, technology: string): boolean {
  return specifier === technology || specifier.startsWith(`${technology}/`);
}

function resolvesInto(file: string, specifier: string, folder: string): boolean {
  if (!specifier.startsWith('.')) return false;
  const target = resolve(dirname(file), specifier);
  return target === join(src, folder) || target.startsWith(join(src, folder) + '/');
}

function layer(file: string): string {
  return relative(src, file);
}

function filesOf(folder: string): string[] {
  const files = tsFiles(join(src, folder));
  if (files.length === 0) throw new Error(`в src/${folder} не найдено ни одного файла`);
  return files;
}

test('ядро зависит только от себя и стандартной библиотеки', () => {
  const violations: string[] = [];
  for (const file of filesOf('core')) {
    for (const specifier of importsOf(file)) {
      if (forbiddenInCore.some((technology) => isTechnology(specifier, technology))) {
        violations.push(`${layer(file)} импортирует технологию ${specifier}`);
      }
      if (resolvesInto(file, specifier, 'adapter') || resolvesInto(file, specifier, 'bootstrap')) {
        violations.push(`${layer(file)} импортирует ${specifier}`);
      }
    }
  }
  expect(violations).toEqual([]);
});

test('входные адаптеры не импортируют выходные', () => {
  const violations: string[] = [];
  for (const file of filesOf('adapter/in')) {
    for (const specifier of importsOf(file)) {
      if (resolvesInto(file, specifier, 'adapter/out')) violations.push(`${layer(file)} импортирует выходной адаптер ${specifier}`);
    }
  }
  expect(violations).toEqual([]);
});

test('выходные адаптеры не импортируют друг друга', () => {
  const violations: string[] = [];
  for (const file of filesOf('adapter/out')) {
    const own = relative(join(src, 'adapter/out'), file).split('/')[0];
    for (const specifier of importsOf(file)) {
      if (resolvesInto(file, specifier, 'adapter/out') && !resolvesInto(file, specifier, `adapter/out/${own}`)) {
        violations.push(`${layer(file)} импортирует соседний адаптер ${specifier}`);
      }
    }
  }
  expect(violations).toEqual([]);
});
