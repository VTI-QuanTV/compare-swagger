import fs from 'fs';

export class CSV {
  private data: string[];

  private content: string;

  build(path: string): void {
    const headers = ['API', 'STATUS', 'TESTCASE', 'RESULT', 'DESCRIPTION']
    this.content = `${headers.toString()}\n${this.data.join('\n')}`;

    fs.writeFileSync(path, this.content);
  }

  setData(data: string[]): void {
    this.data = data;
  }
}
