[![NPM Version](https://img.shields.io/npm/v/@bearbytes/zeno-atom.svg?style=flat)](https://www.npmjs.com/package/@bearbytes/zeno-atom)

# zeno-atom

Zeno Atom is a small state management library for React.

**Note:** This library requires TypeScript 4.0, which is currently in beta! (install as `typescript@beta`).

It has a very limited API and does not try to replace full-fledged state management solutions like [zeno](https://github.com/bearbytes/zeno) or [Redux](https://github.com/reduxjs/redux), and is not meant to manage global state.

Instead, it is meant to be used within complex components or screens, where you have to manage multiple state variables with non-trivial interactions, where using `useState` and prop drilling quickly gets verbose or confusing.

The library provides a single function, `zenoAtom`, which is a typescript-friendly API to set up a React Context with some state and some messages that act on the state. This is similar to `useReducer`, where you dispatch pre-defined messages, but uses [Immer](https://github.com/immerjs/immer) to allow mutating the state object in-place.

### Installation

```
npm i @bearytes/zeno-atom
# or
yarn add @bearbytes/zeno-atom
```

### Basic Example

```tsx
import { zenoAtom } from '@bearbytes/zeno-atom'

// Creates a Context that can be quickly accessed in deeply nested components.
//
// We first describe the `state` of the Context, then describe some `messages` that
// mutate the state. Messages receive the (mutable) state as first parameter and can have
// any number of additional parameters.
//
// zenoAtom returns a Context Provider and a Hook to access the Context.
const [CounterProvider, useCounter] = zenoAtom({
  state: {
    counter: 0,
  },

  messages: {
    resetCounter(s) {
      s.counter = 0
    },
    incrementCounter(s, amount: number) {
      s.counter += amount
    },
  },
})

// The Root component uses the Provider to manage a copy of the atom state.
// You can optionally pass a different initial state object to the provider,
// or just use the default state defined above.
function MyComplexCounter() {
  return (
    <CounterProvider>
      <CounterLabel />
      <ResetButton />
      <PlusOneButton />
    </CounterProvider>
  )
}

// Child components can access the `state` using the hook created above.
function CounterLabel() {
  const { state } = useCounter()
  return <Text>{state.counter}</Text>
}

// All messages defined above can be called on the `dispatch` object returned by the hook.
// The first argument (state) of the message is omitted on the call side and will
// automatically be sourced from the context.
function ResetButton() {
  const { dispatch } = useCounter()
  return <Button onPress={dispatch.resetCounter}>Reset</Button>
}

// If additional arguments are defined for messages, the compiler provides
// autocompletion and type checking for these arguments.
function PlusOneButton() {
  const { dispatch } = useCounter()
  return <Button onPress={() => dispatch.incrementCounter(1)}>+1</Button>
}
```
