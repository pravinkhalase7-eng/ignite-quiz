export type Question = {
  title: string;
  alternatives: string[];
  correct: number;
};

export type Quiz = {
  id: string;
  title: string;
  level: number;
  category?: string;
  icon: 'toggle' | 'code' | 'git' | 'paint' | 'cloud' | 'device' | 'file';
  questions: Question[];
};

export const QUIZZES: Quiz[] = [
  {
    id: '1',
    title: 'Using State',
    level: 1,
    icon: 'toggle',
    questions: [
      {
        title:
          'Hooks are a way to work with functions in React instead of classes. useState and useEffect are examples of widely used hooks. However, it is still not possible to create our own hooks.',
        alternatives: ['True', 'False'],
        correct: 0,
      },
      {
        title:
          'Immutability in React is very important because if we mutate a state value directly instead of replacing it with a new value, the component does not re-render correctly.',
        alternatives: ['True', 'False'],
        correct: 0,
      },
      {
        title: 'About rendering in React, select the incorrect alternative:',
        alternatives: [
          'There are two common cases in which a React component is rendered: the initial render of the component and state updates.',
          'Re-renders usually do not recreate every component the way the initial render does.',
          'An update to a parent component’s state can cause a nested child component to re-render.',
          'React does not follow a defined flow when rendering a screen, and the steps in the process can vary a lot.',
        ],
        correct: 0,
      },
    ],
  },
  {
    id: '2',
    title: 'Using TypeScript',
    level: 2,
    icon: 'code',
    questions: [
      {
        title: "What kind of assignment is this variable, `const fullName: string = 'Dylan Israel';`?",
        alternatives: ['Explicit', 'Implicit'],
        correct: 0,
      },
      {
        title: 'What is the type of `const example = [\'Dylan\']`?',
        alternatives: ['unknown[]', 'string', 'string[]', 'any[]'],
        correct: 2,
      },
      {
        title: 'keyof can be used with index signatures to extract the index type.',
        alternatives: ['True', 'False'],
        correct: 0,
      },
    ],
  },
  {
    id: '3',
    title: 'Using Navigation',
    level: 2,
    icon: 'git',
    questions: [
      {
        title: 'Which description best identifies the Stack Navigator?',
        alternatives: [
          'It adds a fixed menu at the bottom of the device, making frequently used screens easier to reach.',
          'When a new screen opens, it is placed on top of the navigation stack. Going back removes screens from that stack.',
          'It adds a side menu that takes the full height of the device. The menu starts hidden and can be opened by dragging the screen.',
        ],
        correct: 1,
      },
      {
        title:
          'When you type your routes, you can tell at navigation time whether a route receives parameters and what shape those parameters have.',
        alternatives: ['True', 'False'],
        correct: 0,
      },
      {
        title: 'Which statement about NavigationContainer is correct?',
        alternatives: [
          'NavigationContainer is the component used to create a route, receiving the "name" and "component" properties.',
          'NavigationContainer is a hook exported by React Navigation that gives access to functions such as "navigate" and "goBack".',
          'NavigationContainer is a context that shares every route and navigation property with the application.',
        ],
        correct: 2,
      },
    ],
  },
  {
    id: '4',
    title: 'Styled Components',
    level: 3,
    icon: 'paint',
    questions: [
      {
        title: 'CSS-in-JS is the styling strategy in which JavaScript is used to style components.',
        alternatives: ['True', 'False'],
        correct: 0,
      },
      {
        title: 'Select the alternative that is NOT a characteristic of Styled Components.',
        alternatives: [
          'Import styled as the default and use it to create components (for example, styled.View).',
          'You can create predefined styled components with "styled." and also pass custom components through styled().',
          'Styling components looks a lot like writing CSS directly: lowercase letters, hyphens, and a semicolon at the end.',
          'You can customize only the style prop through styled, so other component properties cannot be configured.',
        ],
        correct: 1,
      },
      {
        title: 'With Styled Components it is possible to separate a component’s structure from its styling.',
        alternatives: ['True', 'False'],
        correct: 0,
      },
    ],
  },
  {
    id: '5',
    title: 'Async Storage',
    level: 2,
    icon: 'cloud',
    questions: [
      {
        title: 'Which of the following methods saves information to AsyncStorage?',
        alternatives: ['AsyncStorage.removeItem', 'AsyncStorage.setItem', 'AsyncStorage.getItem'],
        correct: 1,
      },
      {
        title: 'What best describes prop drilling?',
        alternatives: [
          'A strategy where you pass properties through components until you reach the component that needs them.',
          'A strategy where you save information locally on the device and read it when you need it.',
          'A strategy where you share information between components through contexts (Context API).',
        ],
        correct: 1,
      },
      {
        title: 'What is the correct way to save objects in AsyncStorage?',
        alternatives: [
          "await AsyncStorage.setItem('@app:key', { id: 1, name: 'Item 1' });",
          "await AsyncStorage.getItem('@app:key', JSON.stringify({ id: 1, name: 'Item 1' }));",
          "await AsyncStorage.setItem('@app:key', JSON.stringify({ id: 1, name: 'Item 1' }));",
        ],
        correct: 2,
      },
    ],
  },
  {
    id: '6',
    title: 'React Native',
    level: 1,
    icon: 'device',
    questions: [
      {
        title: 'Select the correct statement about React Native:',
        alternatives: [
          'React Native is a JavaScript framework based on React that can create applications only for Android and iOS.',
          'Unlike React, React Native is built entirely by the community and has no relationship with Facebook.',
          'With React Native you can keep almost the entire application in JavaScript and use native code when necessary.',
          'Despite React’s presence on the web, React Native is rarely used in the mobile job market today.',
        ],
        correct: 2,
      },
      {
        title: 'Select the incorrect statement about React Native CLI and Expo:',
        alternatives: [
          'Both React Native CLI and Expo can create applications for iOS and Android.',
          'React Native CLI is the most bare-bones way to create a React Native project. Expo adds features on top of that base, such as Expo Go.',
          'With Expo you can test iOS apps through Expo Go on a physical iOS device even without macOS, which React Native CLI cannot do.',
          'The official React Native documentation recommends only React Native CLI and does not mention Expo.',
        ],
        correct: 3,
      },
      {
        title: 'Select the correct statement about Expo:',
        alternatives: [
          'Expo has two traditional ways to create a project: Managed Workflow and Bare Workflow.',
          'Managed Workflow is the way to create projects where you have access to native code from the start.',
          'With the Bare Workflow you can never use Expo Go.',
          'Setting up the React Native environment for Managed Workflow is more complex than for Bare Workflow.',
        ],
        correct: 3,
      },
      {
        title: 'About componentization in React Native, choose the incorrect alternative:',
        alternatives: [
          'Componentizing is a way to reuse pieces of code in several places.',
          'One advantage is breaking a very complex component into smaller ones, which makes maintenance easier.',
          'Although it helps reuse and simplification, componentizing reduces productivity and readability.',
          'None of the above is correct.',
        ],
        correct: 3,
      },
    ],
  },
];
