import RAPIER from '@dimforge/rapier3d-compat'

/**
 * Rapier world plus a kinematic character controller.
 *
 * World gravity is zero on purpose: gravity lives in shared/movement.js so the
 * server computes it identically. Rapier is used here only to answer "how far
 * can this capsule actually move", never to decide how fast it should move.
 */
export async function createPhysics() {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })

  return {
    world,
    RAPIER,

    /**
     * Add a static box collider.
     *
     * @param {{ half: {x:number,y:number,z:number}, position: {x:number,y:number,z:number},
     *           rotation?: {x:number,y:number,z:number,w:number} }} box
     */
    addStaticBox(box) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
        box.position.x,
        box.position.y,
        box.position.z
      )
      if (box.rotation) bodyDesc.setRotation(box.rotation)

      const body = world.createRigidBody(bodyDesc)
      const colliderDesc = RAPIER.ColliderDesc.cuboid(box.half.x, box.half.y, box.half.z)
      return world.createCollider(colliderDesc, body)
    },

    /**
     * Create the player capsule and its controller.
     *
     * Rapier measures a capsule by the half-height of its cylindrical section,
     * excluding the two hemispherical caps, so total height is
     * 2 * halfHeight + 2 * radius.
     *
     * @param {{ position: {x:number,y:number,z:number}, height: number, radius: number,
     *           stepHeight: number, slopeLimitRad: number }} opts
     */
    createCharacter(opts) {
      const halfHeight = halfHeightFor(opts.height, opts.radius)
      const centreY = opts.position.y + opts.height / 2

      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          opts.position.x,
          centreY,
          opts.position.z
        )
      )
      const collider = world.createCollider(
        RAPIER.ColliderDesc.capsule(halfHeight, opts.radius),
        body
      )

      const controller = world.createCharacterController(0.01)
      controller.setUp({ x: 0, y: 1, z: 0 })
      controller.setMaxSlopeClimbAngle(opts.slopeLimitRad)
      // Slightly under the climb limit: a surface too steep to walk up should
      // slide, not hold the player still.
      controller.setMinSlopeSlideAngle(opts.slopeLimitRad * 0.9)
      controller.enableAutostep(opts.stepHeight, opts.radius * 0.5, true)
      controller.enableSnapToGround(opts.stepHeight)
      controller.setApplyImpulsesToDynamicBodies(false)

      return {
        body,
        collider,
        controller,

        /**
         * Resolve a desired translation against the world.
         *
         * @param {{x:number,y:number,z:number}} desired
         * @param {boolean} rising true while moving upward, e.g. a jump
         * @returns {{ movement: {x:number,y:number,z:number}, grounded: boolean }}
         */
        move(desired, rising) {
          // Snapping to ground during a jump would cancel the jump on its first
          // step, so it is switched off while rising.
          if (rising) controller.disableSnapToGround()
          else controller.enableSnapToGround(opts.stepHeight)

          controller.computeColliderMovement(collider, desired)
          const movement = controller.computedMovement()

          return {
            movement: { x: movement.x, y: movement.y, z: movement.z },
            grounded: controller.computedGrounded(),
          }
        },

        /**
         * Move the capsule so its FEET sit at this position.
         * @param {{x:number,y:number,z:number}} feet
         * @param {number} height current capsule height
         */
        setFeetPosition(feet, height) {
          body.setNextKinematicTranslation({
            x: feet.x,
            y: feet.y + height / 2,
            z: feet.z,
          })
        },

        /**
         * Resize the capsule for crouching. The feet stay put; the caller
         * repositions the body straight after.
         * @param {number} height
         */
        setHeight(height) {
          collider.setHalfHeight(halfHeightFor(height, opts.radius))
        },
      }
    },

    step() {
      world.step()
    },
  }
}

/** @param {number} height @param {number} radius */
function halfHeightFor(height, radius) {
  // Guard against a capsule shorter than its own caps, which Rapier rejects.
  return Math.max(0.01, height / 2 - radius)
}
