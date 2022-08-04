import fs from 'fs';
import { CSV_HEADERS } from '../../constants';

export class CSV {
  private data: string[];

  private content: string;

  build(path: string): void {
    this.content = `${CSV_HEADERS.toString()}\n${this.data.join('\n')}`;

    fs.writeFileSync(path, this.content);
  }

  setData(data: string[]): void {
    this.data = data;
  }
}
