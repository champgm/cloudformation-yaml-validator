import { Position } from 'vscode';

export function getRowColumnPosition(text: string, absolutePosition: number): Position {
  // YAML library doesn't have a line + column position, only absolute
  // So we have to count the lines.
  const textBefore = text.substring(0, absolutePosition);

  // This will gather all individual matches (containing metadata about position, etc)
  const matches: RegExpExecArray[] = [];
  const regEx = new RegExp('\r?\n', 'g');
  let match;
  while ((match = (regEx.exec(textBefore) as RegExpExecArray)) != null) {
    matches.push(match);
  }

  // Matches will contain each match on line return
  // the number of matches is the number of line-returns in the file before this position
  // That is also the line (starting from 0) on which this position can be found
  const line = matches.length;

  // The last line return in textBefore is the one before our absolute position
  const lastLineReturn = matches[matches.length - 1];
  const afterLastLineReturn = lastLineReturn.index + lastLineReturn[0].length;

  // So, absolutePosition - afterLastLineReturn should give us the column number for our absolute position
  const character = absolutePosition - afterLastLineReturn;
  return new Position(line, character);
}
