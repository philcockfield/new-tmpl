import {
  R,
  file,
  fs,
  fsPath,
  log,
  constants,
  loadSettings,
  ISettings,
  ITemplate,
  ITemplateVariables,
  ITemplateFile,
  inquirer,
  printTitle,
  ICreateOptions,
} from '../common';

export const name = 'tmpl';
export const alias = 't';
export const description = 'Runs a generator template.';
export const args = {};

/**
 * CLI
 */
export async function cmd(args?: { params: string[]; options: {} }) {
  await create();
}

/**
 * Creates a new template
 */
export async function create(options: ICreateOptions = {}) {
  // Retrieve settings.
  const { settingsPath } = options;
  const settings = (await loadSettings({ path: settingsPath })) as ISettings;
  if (!settings) {
    log.warn.yellow(constants.CONFIG_NOT_FOUND_ERROR);
    return;
  }

  // Prompt for the template to use.
  const template = await promptForTemplate(settings.templates);
  if (!template) {
    return;
  }
  printTitle(`Create from template: ${log.magenta(template.name)}`);

  // Copy the template.
  const variables = await promptForVariables(template);
  const success = await writeFile(template, variables);

  // Finish up.
  log.info();
  if (success) {
    log.info.green(`✨✨  Done`);
  }
}

async function promptForTemplate(templates: ITemplate[]) {
  const choices = templates.map(item => ({ name: item.name, value: item.dir }));
  const confirm = {
    type: 'list',
    name: 'path',
    message: 'Select a template',
    choices,
  };
  const { path } = (await inquirer.prompt(confirm)) as { path: string };
  const result = templates.find(item => item.dir === path);
  return result;
}

async function promptForVariables(template: ITemplate) {
  const result = {} as any;
  for (const key of Object.keys(template.variables)) {
    const description = template.variables[key];
    result[key] = await promptForVariable(key, description);
  }
  return result;
}

async function promptForVariable(key: string, description: string) {
  description = description.replace(/\.$/, '');
  if (!description.endsWith('?')) {
    description += ':';
  }
  const confirm = {
    type: 'input',
    name: 'value',
    message: description,
  };
  const { value } = (await inquirer.prompt(confirm)) as { value: string };
  return value;
}

const writeFile = async (
  template: ITemplate,
  variables: ITemplateVariables,
) => {
  log.info();
  const folderName = variables[template.folder]
    ? variables[template.folder].replace(/\//g, '-')
    : 'Unnamed';
  const dir = fsPath.join(process.cwd(), folderName);
  if (fs.existsSync(dir)) {
    log.info.yellow(`⚠️  WARNING: Directory already exists.`);
    log.info.yellow(`    - Directory: ${log.magenta(dir)}`);
    log.info.yellow(`    - Template not created.`);
    return false;
  }

  fs.ensureDirSync(dir);
  log.info.blue('Creating:');

  const files = await loadFiles(template.dir);

  files.forEach(file => {
    const filePath = file.path.replace(
      new RegExp(`__${template.folder}__`, 'g'),
      folderName,
    );
    const fullPath = fsPath.join(process.cwd(), folderName, filePath);
    let text = file.text;
    Object.keys(variables).forEach(key => {
      const replaceWith = variables[key];
      if (replaceWith) {
        text = text.replace(new RegExp(`__${key}__`, 'g'), replaceWith);
      }
    });
    fs.ensureDirSync(fsPath.dirname(fullPath));
    fs.writeFileSync(fullPath, text);
    log.info.blue(`  ${fullPath}`);
  });

  return true;
};

const loadFiles = async (dir: string) => {
  const IGNORE = ['.DS_Store', '.template.yml', '.template.yaml'];
  const files = await file.glob(`${dir}**`, { nodir: true, dot: true });
  return files
    .filter(path => R.none(ignore => path.endsWith(ignore), IGNORE))
    .map(path => {
      const name = fsPath.basename(path);
      const result: ITemplateFile = {
        name,
        path: path.substr(dir.length, path.length),
        text: fs.readFileSync(path).toString(),
      };
      return result;
    });
};
