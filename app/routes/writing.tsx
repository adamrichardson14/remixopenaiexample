import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useTransition,
} from "@remix-run/react";

import { useUser } from "~/utils";
import { requireUserId } from "~/session.server";
import type { LoaderFunction, ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getUserById, UpdateTokens } from "~/models/user.server";
import {
  addCompletion,
  getMostRecentCompletions,
} from "~/models/completions.server";
import type { Completion } from "@prisma/client";

export const loader: LoaderFunction = async ({ request }) => {
  const userId = await requireUserId(request);
  const currentUser = await getUserById(userId);
  const recentCompletions = await getMostRecentCompletions(String(userId));

  return json({ recentCompletions, currentUser });
};

export const action: ActionFunction = async ({ request }) => {
  const userId = await requireUserId(request);
  const currentUser = await getUserById(userId);

  const reqBody = await request.formData();
  const body = Object.fromEntries(reqBody);
  // Check the user has enough tokens
  const errors = {
    tokens:
      currentUser && Number(body.tokens) > currentUser.tokens
        ? "Not enough tokens"
        : undefined,
  };
  // if not enough return an error
  const hasErrors = Object.values(errors).some((errorMessage) => errorMessage);

  if (hasErrors) {
    return json(errors);
  }

  // Make the request to OPENAI API

  try {
    const response = await fetch(
      "https://api.openai.com/v1/engines/text-davinci-002/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_KEY}`,
        },
        body: JSON.stringify({
          prompt: body.prompt,
          max_tokens: Number(body.tokens),
          temperature: 0.9,
          top_p: 1,
          frequency_penalty: 0.52,
          presence_penalty: 0.9,
          n: 1,
          best_of: 2,
          stream: false,
          logprobs: null,
        }),
      }
    );

    const data = await response.json();
    const completionText = data.choices[0].text;
    // Save the completion to the database
    const addedCompletion = await addCompletion({
      aiCompletion: completionText,
      userId,
      prompt: String(body.prompt),
      tokens: Number(body.tokens),
    });
    console.log(addedCompletion);

    // Update the user tokens if request succesful
    const updatedTokens = await UpdateTokens(
      userId,
      Number(currentUser && currentUser?.tokens - Number(body.tokens))
    );

    return json({ errors: undefined, addedCompletion });
  } catch (error: any) {
    console.log(error);
    // If not successful, return error
    return json({ errors: error.message });
  }
};

// Bring recent completions onto page from the database
// Make this look pretty

export default function Writing() {
  const errors = useActionData();
  const loaderData = useLoaderData();
  const { currentUser: user, recentCompletions } = loaderData;
  console.log(recentCompletions);
  const transition = useTransition();
  return (
    <div className="text-slate-100">
      <div className="mx-auto mt-4 flex w-full items-center justify-between text-slate-200">
        <p>Welcome {user.email}</p>
        <div className="flex gap-5">
          <Form action="/logout" method="post">
            <button
              type="submit"
              className="rounded bg-slate-600 py-2 px-4 text-blue-100 hover:bg-blue-500 active:bg-blue-600"
            >
              Logout
            </button>
          </Form>
        </div>
      </div>
      <h1 className="text-2xl font-bold ">AI Writing tool</h1>

      <Form method="post">
        <fieldset
          disabled={transition.state === "submitting"}
          className="mt-4 w-full"
        >
          <textarea
            name="prompt"
            id="prompt"
            rows={5}
            className="w-full rounded-sm bg-slate-800 p-4 text-slate-200 disabled:bg-slate-800 disabled:text-slate-400"
          ></textarea>
          {errors && <p className="text-sm text-red-700">{errors.tokens}</p>}

          <div className="mt-4 flex items-center">
            <input
              type="number"
              name="tokens"
              id="tokens"
              defaultValue={150}
              className="w-24 rounded-sm bg-slate-800 p-4 text-slate-200 disabled:bg-slate-900"
            />
            <button
              type="submit"
              className="ml-4 rounded bg-slate-600 py-2 px-4 text-blue-100 hover:bg-blue-500 active:bg-blue-600 disabled:bg-slate-800 disabled:hover:bg-slate-800"
            >
              Submit
            </button>
            <div className="ml-4">
              You have {user.tokens.toLocaleString()} tokens remaining
            </div>
          </div>
        </fieldset>
      </Form>
      {transition.state && transition.state === "submitting" && (
        <div className="my-8 flex justify-center">
          <div className="loader">Loading...</div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-xl font-bold text-indigo-500">
          Recent Completions
        </h2>
        {recentCompletions &&
          recentCompletions.map((completion: Completion) => {
            let text: any = completion.answer;
            if (text.includes("\n")) {
              text = text.split("\n");
            }
            text = [...text];
            return (
              <div className="mt-8" key={completion.id}>
                <h3 className="font-mono text-xl font-semibold text-white">
                  {completion.prompt}
                </h3>
                <div>
                  {text &&
                    text.map((line: string) => (
                      <p
                        className="mt-2"
                        key={`${line}-${Math.random()
                          .toString(36)
                          .slice(2, 7)}`}
                      >
                        {line}
                      </p>
                    ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
