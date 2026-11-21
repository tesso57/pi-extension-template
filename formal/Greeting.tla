--------------------------- MODULE Greeting ---------------------------
EXTENDS Naturals

\* The /hello registration and handler in extensions/index.ts.
\* Each element of Invocations names one dispatch by Pi, regardless of args.
\* Models one extension instance with a functioning Pi notification API.
CONSTANT Invocations

VARIABLES registered, requested, pending, notifications
vars == <<registered, requested, pending, notifications>>

Delivery(count, text, level) == [count |-> count, text |-> text, level |-> level]
Greeting(count) == Delivery(count, "Hello from your Pi extension!", "info")
NoDelivery == Delivery(0, "", "")

Init ==
    /\ registered = FALSE
    /\ requested = {}
    /\ pending = {}
    /\ notifications = [i \in Invocations |-> NoDelivery]

Register ==
    /\ ~registered
    /\ registered' = TRUE
    /\ UNCHANGED <<requested, pending, notifications>>

Dispatch(i) ==
    /\ registered
    /\ i \notin requested
    /\ requested' = requested \cup {i}
    /\ pending' = pending \cup {i}
    /\ UNCHANGED <<registered, notifications>>

Handle(i) ==
    /\ i \in pending
    /\ pending' = pending \ {i}
    /\ notifications' = [notifications EXCEPT ![i] = Greeting(@.count + 1)]
    /\ UNCHANGED <<registered, requested>>

Next == Register \/ (\E i \in Invocations : Dispatch(i) \/ Handle(i))
Spec == Init /\ [][Next]_vars

Safety ==
    /\ registered \in BOOLEAN
    /\ requested \subseteq Invocations
    /\ (requested # {} => registered)
    /\ pending \subseteq requested
    /\ DOMAIN notifications = Invocations
    /\ \A i \in Invocations :
        IF i \in requested \ pending
        THEN notifications[i] = Greeting(1)
        ELSE notifications[i] = NoDelivery

======================================================================
