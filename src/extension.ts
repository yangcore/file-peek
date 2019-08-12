import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';

const rootPath = vscode.workspace.rootPath;
function isDir(path) {
   return fs.existsSync(path) && fs.statSync(path).isDirectory()
}
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

   // Use the console to output diagnostic information (console.log) and errors (console.error)
   // This line of code will only be executed once when your extension is activated
   //console.log('Congratulations, your extension "vscode-file-peek" is now active!');

   let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('file_peek');
   let active_languages: string[] = config.get('activeLanguages');
   let search_file_extensions: string[] = config.get('searchFileExtensions');

   /*
   vscode.languages.getLanguages().then((languages: string[]) => {
      console.log("Known languages: " + languages);
   });
   */

   const peek_filter: vscode.DocumentFilter[] = active_languages.map((language) => {
      return {
         language: language,
         scheme: 'file'
      };
   });

   // Register the definition provider
   context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(peek_filter,
         new PeekFileDefinitionProvider(search_file_extensions))
   );
}

// this method is called when your extension is deactivated
export function deactivate() {
}


/**
 * Provide the lookup so we can peek into the files.
 */
class PeekFileDefinitionProvider implements vscode.DefinitionProvider {
   protected fileSearchExtensions: string[] = [];

   constructor(fileSearchExtensions: string[] = []) {
      this.fileSearchExtensions = fileSearchExtensions;
   }

   /**
    * Return list of potential paths to check
    * based upon file search extensions for a potential lookup.
    */
   getPotentialPaths(lookupPath: string): string[] {
      let potential_paths: string[] = [lookupPath];

      // Add on list where we just add the file extension directly
      this.fileSearchExtensions.forEach((extStr) => {
         potential_paths.push(path.join(lookupPath, `index${extStr}`));
         potential_paths.push(lookupPath + extStr);
      });

      // if we have an extension, then try replacing it.
      let parsed_path = path.parse(lookupPath);
      if (parsed_path.ext !== "") {
         this.fileSearchExtensions.forEach((extStr) => {
            const new_path = path.format({
               base: parsed_path.name + extStr,
               dir: parsed_path.dir,
               ext: extStr,
               name: parsed_path.name,
               root: parsed_path.root
            });
            potential_paths.push(new_path);
         });
      }

      return potential_paths;
   }

   provideDefinition(document: vscode.TextDocument,
      position: vscode.Position,
      token: vscode.CancellationToken): vscode.Definition {
      // todo: make this method operate async
      let working_dir = path.dirname(document.fileName);
      let word = document.getText(document.getWordRangeAtPosition(position));
      let line = document.lineAt(position);
      let lineText = line.text
      const jsconfig_path = path.resolve(rootPath, 'jsconfig.json')
      let jsconfigPaths
      let flag: boolean = false

      if (fs.existsSync(jsconfig_path)) {
         const jsconfig = JSON.parse(fs.readFileSync(path.resolve(rootPath, 'jsconfig.json')).toString().replace(/(\/\*)/g, ''))
         jsconfigPaths = jsconfig.compilerOptions ? jsconfig.compilerOptions.paths : '';
         for (const key in jsconfigPaths) {
            const value = jsconfigPaths[key][0]
            if (lineText.indexOf(key) >= 0 && lineText.indexOf('@import') < 0) {
               lineText = lineText.replace(new RegExp(key, "g"), value)
               flag = true
            }
         }
      }

      //console.log('====== peek-file definition lookup ===========');
      //console.log('word: ' + word);
      //console.log('line: ' + line.text);

      // We are looking for strings with filenames
      // - simple hack for now we look for the string with our current word in it on our line
      //   and where our cursor position is inside the string
      let re_str = `\"(.*?${word}.*?)\"|\'(.*?${word}.*?)\'`;

      let match = lineText.match(re_str);

      //console.log('re_str: ' + re_str);
      //console.log("   Match: ", match);

      if (null !== match) {
         let potential_fname = match[1] || match[2];
         let match_start = match.index;
         let match_end = match.index + potential_fname.length;

         // Verify the match string is at same location as cursor
         if ((position.character >= match_start) &&
            (position.character <= match_end)) {
            let full_path = (jsconfigPaths && flag) ? path.join(rootPath, potential_fname) : path.resolve(working_dir, potential_fname);
            //console.log(" Match: ", match);
            //console.log(" Fname: " + potential_fname);
            //console.log("  Full: " + full_path);

            // Find all potential paths to check and return the first one found
            let potential_fnames = this.getPotentialPaths(full_path);
            console.log(" potential fnames: ", potential_fnames);

            let found_fname = potential_fnames.find((fname_full) => {
               if (!isDir(fname_full)) {
                  console.log(" checking: ", fname_full);
                  return fs.existsSync(fname_full);
               }
            });

            if (found_fname != null) {
               console.log('found: ' + found_fname);
               return new vscode.Location(vscode.Uri.file(found_fname), new vscode.Position(0, 1));
            }
         }
      }

      return null;
   }
}
